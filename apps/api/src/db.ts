// Default-import then destructure: @prisma/client is CommonJS so the named
// import fails when Node loads the compiled dist as ESM. tsx (dev) was
// hiding this with its CJS interop loader.
import pkg from "@prisma/client";
import { config } from "./config.js";

const { PrismaClient } = pkg;
type PrismaClient = InstanceType<typeof PrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: config.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (config.NODE_ENV !== "production") globalThis.__prisma = prisma;
