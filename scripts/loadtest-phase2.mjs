#!/usr/bin/env node

process.env.PHASE0_BASE_URL ??= process.env.PHASE2_BASE_URL;
process.env.PHASE0_CODE ??= process.env.PHASE2_CODE;
process.env.PHASE0_USERS ??= process.env.PHASE2_USERS ?? "10000";
process.env.PHASE0_CONCURRENCY ??= process.env.PHASE2_CONCURRENCY ?? "250";
process.env.PHASE0_SSE_HOLD_MS ??= process.env.PHASE2_SSE_HOLD_MS ?? "60000";
process.env.PHASE0_ANSWER_QUESTIONS ??= process.env.PHASE2_ANSWER_QUESTIONS ?? "1";

await import("./loadtest-phase0.mjs");
