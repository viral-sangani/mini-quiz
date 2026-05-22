import Redis from "ioredis";
import { config } from "../config.js";

export function createRedisClient(role: string): Redis | null {
  if (!config.REDIS_URL) return null;
  const client = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    connectionName: `mini-quiz:${role}`,
  });
  client.on("error", () => {
    // Redis is optional in local/dev; callers decide whether to fall back.
  });
  return client;
}

export async function readyRedis(client: Redis | null): Promise<Redis | null> {
  if (!client) return null;
  if (client.status === "ready") return client;
  try {
    if (client.status === "wait" || client.status === "end") {
      await client.connect();
    } else if (client.status === "connecting" || client.status === "connect") {
      await new Promise<void>((resolve) => {
        client.once("ready", () => resolve());
        client.once("error", () => resolve());
      });
    }
    return (client.status as string) === "ready" ? client : null;
  } catch {
    return null;
  }
}
