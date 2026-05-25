import { request as httpsRequest } from "node:https";
import { readFile } from "node:fs/promises";
import pino from "pino";
import { config } from "./config.js";
import { prisma } from "./db.js";
import {
  decideCapacityMode,
  guardIdleDownscale,
  type CapacityDecision,
  type CapacityMode,
  type CapacityQuizCandidate,
} from "./services/capacity-prewarmer-policy.js";
import { scoreWorkerLag, stopNats } from "./services/nats.js";

type Target = {
  name: string;
  idleMin: number;
  warmMin: number;
  max: number;
};

type HpaState = {
  name: string;
  minReplicas: number;
  maxReplicas: number;
};

type RuntimeConfig = {
  dryRun: boolean;
  namespace: string;
  warmLeadMs: number;
  cooldownMs: number;
  nodePoolEnabled: boolean;
  doToken: string | null;
  clusterId: string | null;
  clusterName: string;
  nodePoolId: string | null;
  nodePoolName: string;
  nodeMax: number;
};

type DoNodePool = {
  id: string;
  name: string;
  auto_scale?: boolean;
  min_nodes?: number;
  max_nodes?: number;
  tags?: string[];
  labels?: Record<string, string> | null;
  taints?: Array<{ key: string; value?: string; effect: string }>;
};

const log = pino({ level: config.LOG_LEVEL });

const targets: Target[] = [
  { name: "api", idleMin: 1, warmMin: 2, max: 4 },
  { name: "api-realtime", idleMin: 1, warmMin: 2, max: 8 },
  { name: "api-score-worker", idleMin: 1, warmMin: 2, max: 8 },
];

function boolEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function runtimeConfig(): RuntimeConfig {
  return {
    dryRun: boolEnv("CAPACITY_PREWARMER_DRY_RUN"),
    namespace: process.env.CAPACITY_PREWARMER_NAMESPACE ?? "api",
    warmLeadMs: intEnv("CAPACITY_PREWARMER_WARM_LEAD_MS", 10 * 60_000),
    cooldownMs: intEnv("CAPACITY_PREWARMER_COOLDOWN_MS", 10 * 60_000),
    nodePoolEnabled: boolEnv("CAPACITY_PREWARMER_NODE_POOL_ENABLED", true),
    doToken: process.env.DIGITALOCEAN_TOKEN ?? null,
    clusterId: process.env.DIGITALOCEAN_CLUSTER_ID ?? null,
    clusterName: process.env.DIGITALOCEAN_CLUSTER_NAME ?? "miniquiz-prod",
    nodePoolId: process.env.DIGITALOCEAN_NODE_POOL_ID ?? null,
    nodePoolName: process.env.DIGITALOCEAN_NODE_POOL_NAME ?? "main",
    nodeMax: intEnv("DIGITALOCEAN_NODE_POOL_MAX_NODES", 4),
  };
}

async function main(): Promise<void> {
  const cfg = runtimeConfig();
  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: {
      kind: "LIVE",
      archivedAt: null,
      status: { in: ["SCHEDULED", "LIVE", "ENDED"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledStart: true,
      endedAt: true,
      prizeAmounts: true,
    },
  });
  const candidates: CapacityQuizCandidate[] = quizzes.map((quiz) => ({
    ...quiz,
    status: quiz.status as CapacityQuizCandidate["status"],
  }));
  const baseDecision = decideCapacityMode(candidates, now, {
    warmLeadMs: cfg.warmLeadMs,
    cooldownMs: cfg.cooldownMs,
  });
  const hpas = cfg.dryRun ? assumeHpaState(baseDecision.mode) : await readHpas(cfg);
  const decision = await applyDownscaleGuard(baseDecision, hpas, cfg);
  const desired = capacityTargets(decision.mode);

  log.info(
    {
      dryRun: cfg.dryRun,
      mode: decision.mode,
      reasons: decision.reasons,
      hpaTargets: desired,
      nodePool: {
        enabled: cfg.nodePoolEnabled,
        minNodes: decision.mode === "warm" ? 2 : 1,
        maxNodes: cfg.nodeMax,
      },
    },
    "capacity prewarmer decision",
  );

  if (cfg.dryRun) return;

  await patchHpas(cfg, hpas, desired);
  await updateDigitalOceanNodePool(cfg, decision.mode).catch((err) => {
    log.warn({ err }, "capacity prewarmer: DigitalOcean node pool update failed");
  });
}

function capacityTargets(mode: CapacityMode): Record<string, { min: number; max: number }> {
  return Object.fromEntries(
    targets.map((target) => [
      target.name,
      {
        min: mode === "warm" ? target.warmMin : target.idleMin,
        max: target.max,
      },
    ]),
  );
}

function assumeHpaState(mode: CapacityMode): HpaState[] {
  return targets.map((target) => ({
    name: target.name,
    minReplicas: mode === "warm" ? target.warmMin : target.idleMin,
    maxReplicas: target.max,
  }));
}

async function applyDownscaleGuard(
  decision: CapacityDecision,
  hpas: HpaState[],
  cfg: RuntimeConfig,
): Promise<CapacityDecision> {
  if (decision.mode === "warm") return decision;
  const currentlyWarm = hpas.some((hpa) => {
    const target = targets.find((t) => t.name === hpa.name);
    return target ? hpa.minReplicas > target.idleMin : false;
  });
  if (!currentlyWarm) return decision;

  try {
    const lag = await scoreWorkerLag(log);
    return guardIdleDownscale(decision, currentlyWarm, {
      status: "ok",
      pending: lag.pending,
      ackPending: lag.ackPending,
    });
  } catch (err) {
    log.warn({ err }, "capacity prewarmer: skipping downscale because NATS lag check failed");
    return guardIdleDownscale(decision, currentlyWarm, {
      status: "unavailable",
      reason: "keeping warm capacity",
    });
  } finally {
    await stopNats();
  }
}

async function readHpas(cfg: RuntimeConfig): Promise<HpaState[]> {
  const out: HpaState[] = [];
  for (const target of targets) {
    const hpa = await kubernetesRequest<{
      spec?: { minReplicas?: number; maxReplicas?: number };
    }>(
      "GET",
      `/apis/autoscaling/v2/namespaces/${cfg.namespace}/horizontalpodautoscalers/${target.name}`,
    );
    out.push({
      name: target.name,
      minReplicas: hpa.spec?.minReplicas ?? target.idleMin,
      maxReplicas: hpa.spec?.maxReplicas ?? target.max,
    });
  }
  return out;
}

async function patchHpas(
  cfg: RuntimeConfig,
  current: HpaState[],
  desired: Record<string, { min: number; max: number }>,
): Promise<void> {
  for (const hpa of current) {
    const next = desired[hpa.name];
    if (!next) continue;
    if (hpa.minReplicas === next.min && hpa.maxReplicas === next.max) {
      log.info({ hpa: hpa.name }, "capacity prewarmer: HPA already correct");
      continue;
    }
    await kubernetesRequest(
      "PATCH",
      `/apis/autoscaling/v2/namespaces/${cfg.namespace}/horizontalpodautoscalers/${hpa.name}`,
      { spec: { minReplicas: next.min, maxReplicas: next.max } },
      "application/merge-patch+json",
    );
    log.info(
      { hpa: hpa.name, minReplicas: next.min, maxReplicas: next.max },
      "capacity prewarmer: patched HPA",
    );
  }
}

async function kubernetesRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  contentType = "application/json",
): Promise<T> {
  const token = await readFile(
    "/var/run/secrets/kubernetes.io/serviceaccount/token",
    "utf8",
  );
  const ca = await readFile(
    "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt",
  );
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise<T>((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: "kubernetes.default.svc",
        port: 443,
        method,
        path,
        ca,
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": contentType,
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(
                `Kubernetes ${method} ${path} failed with ${res.statusCode}: ${data}`,
              ),
            );
            return;
          }
          resolve(data ? (JSON.parse(data) as T) : ({} as T));
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error(`Kubernetes ${method} ${path} timed out`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function updateDigitalOceanNodePool(
  cfg: RuntimeConfig,
  mode: CapacityMode,
): Promise<void> {
  if (!cfg.nodePoolEnabled) {
    log.info("capacity prewarmer: node pool updates disabled");
    return;
  }
  if (!cfg.doToken) {
    log.warn("capacity prewarmer: DIGITALOCEAN_TOKEN missing; skipping node pool update");
    return;
  }
  const minNodes = mode === "warm" ? 2 : 1;
  const { clusterId, nodePool } = await findDigitalOceanNodePool(cfg);
  if (
    nodePool.auto_scale === true &&
    nodePool.min_nodes === minNodes &&
    nodePool.max_nodes === cfg.nodeMax
  ) {
    log.info(
      { nodePool: nodePool.name, minNodes, maxNodes: cfg.nodeMax },
      "capacity prewarmer: DigitalOcean node pool already correct",
    );
    return;
  }
  await doRequest(
    cfg.doToken,
    "PUT",
    `/v2/kubernetes/clusters/${clusterId}/node_pools/${nodePool.id}`,
    pruneUndefined({
      name: nodePool.name,
      tags: nodePool.tags,
      labels: nodePool.labels,
      taints: nodePool.taints,
      auto_scale: true,
      min_nodes: minNodes,
      max_nodes: cfg.nodeMax,
    }),
  );
  log.info(
    { nodePool: nodePool.name, minNodes, maxNodes: cfg.nodeMax },
    "capacity prewarmer: updated DigitalOcean node pool",
  );
}

async function findDigitalOceanNodePool(
  cfg: RuntimeConfig,
): Promise<{ clusterId: string; nodePool: DoNodePool }> {
  const clusterId = cfg.clusterId ?? (await findDigitalOceanClusterId(cfg));
  if (cfg.nodePoolId) {
    const nodePool = await doRequest<{ node_pool: DoNodePool }>(
      cfg.doToken!,
      "GET",
      `/v2/kubernetes/clusters/${clusterId}/node_pools/${cfg.nodePoolId}`,
    );
    return { clusterId, nodePool: nodePool.node_pool };
  }
  const pools = await doRequest<{ node_pools: DoNodePool[] }>(
    cfg.doToken!,
    "GET",
    `/v2/kubernetes/clusters/${clusterId}/node_pools`,
  );
  const nodePool = pools.node_pools.find((pool) => pool.name === cfg.nodePoolName);
  if (!nodePool) {
    throw new Error(`DigitalOcean node pool not found: ${cfg.nodePoolName}`);
  }
  return { clusterId, nodePool };
}

async function findDigitalOceanClusterId(cfg: RuntimeConfig): Promise<string> {
  const clusters = await doRequest<{
    kubernetes_clusters: Array<{ id: string; name: string }>;
  }>(cfg.doToken!, "GET", "/v2/kubernetes/clusters?per_page=200");
  const cluster = clusters.kubernetes_clusters.find(
    (item) => item.name === cfg.clusterName,
  );
  if (!cluster) {
    throw new Error(`DigitalOcean cluster not found: ${cfg.clusterName}`);
  }
  return cluster.id;
}

async function doRequest<T = unknown>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const payload = body == null ? null : JSON.stringify(body);
  const response = await fetch(`https://api.digitalocean.com${path}`, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`DigitalOcean ${method} ${path} failed with ${response.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function pruneUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

main()
  .catch((err) => {
    log.error({ err }, "capacity prewarmer failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
