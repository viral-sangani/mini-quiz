import { PostHog } from "posthog-node";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

const client = config.POSTHOG_PROJECT_TOKEN
  ? new PostHog(config.POSTHOG_PROJECT_TOKEN, {
      host: config.POSTHOG_HOST,
      enableExceptionAutocapture: true,
    })
  : null;

type CaptureOptions = {
  distinctId?: string | null;
  properties?: Record<string, unknown>;
};

export function captureBackendEvent(
  event: string,
  options: CaptureOptions = {},
) {
  if (!client) return;
  client.capture({
    distinctId: normalizeDistinctId(options.distinctId) ?? "anonymous",
    event,
    properties: withCommonProperties(options.properties),
  });
}

export function identifyWallet(
  walletAddress: string,
  properties: Record<string, unknown> = {},
) {
  const distinctId = normalizeDistinctId(walletAddress);
  if (!client || !distinctId) return;
  client.identify({
    distinctId,
    properties: {
      wallet_address: distinctId,
      ...properties,
    },
  });
}

export function captureBackendException(
  error: unknown,
  options: CaptureOptions = {},
) {
  if (!client) return;
  client.captureException(
    error,
    normalizeDistinctId(options.distinctId) ?? "anonymous",
    withCommonProperties(options.properties),
  );
}

export async function shutdownPostHog() {
  if (!client) return;
  await client.shutdown(5_000);
}

export function distinctIdFromRequest(req: FastifyRequest): string | null {
  const header = req.headers["x-posthog-distinct-id"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  return (
    normalizeDistinctId(headerValue) ??
    walletFromRecord(req.body) ??
    walletFromRecord(req.query) ??
    null
  );
}

export function requestAnalyticsProperties(req: FastifyRequest) {
  return {
    method: req.method,
    route: req.routeOptions.url ?? req.url.split("?")[0],
    url_path: req.url.split("?")[0],
  };
}

export function shouldCapturePublicRequest(req: FastifyRequest): boolean {
  const route = req.routeOptions.url ?? req.url;
  return (
    !route.startsWith("/admin") &&
    route !== "/health" &&
    !route.startsWith("/events/") &&
    !route.includes("/events")
  );
}

function withCommonProperties(properties: Record<string, unknown> = {}) {
  return {
    app: "api",
    app_role: config.APP_ROLE,
    environment: config.NODE_ENV,
    ...properties,
  };
}

function normalizeDistinctId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return WALLET_RE.test(value) ? value.toLowerCase() : value;
}

function walletFromRecord(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const walletAddress = (value as { walletAddress?: unknown }).walletAddress;
  return normalizeDistinctId(walletAddress);
}
