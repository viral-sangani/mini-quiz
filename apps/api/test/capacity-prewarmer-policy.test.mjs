import assert from "node:assert/strict";
import test from "node:test";
import {
  decideCapacityMode,
  guardIdleDownscale,
} from "../dist/services/capacity-prewarmer-policy.js";

const now = new Date("2026-05-25T10:00:00.000Z");

function quiz(overrides) {
  return {
    id: "quiz-1",
    title: "Paid quiz",
    status: "SCHEDULED",
    scheduledStart: new Date("2026-05-25T10:09:00.000Z"),
    endedAt: null,
    prizeAmounts: ["1"],
    ...overrides,
  };
}

test("no paid live quizzes is idle", () => {
  assert.equal(decideCapacityMode([], now).mode, "idle");
  assert.equal(
    decideCapacityMode([quiz({ prizeAmounts: ["0"] })], now).mode,
    "idle",
  );
});

test("paid quiz starting in 9 minutes is warm", () => {
  assert.equal(decideCapacityMode([quiz({})], now).mode, "warm");
});

test("paid quiz starting in 11 minutes is idle", () => {
  assert.equal(
    decideCapacityMode(
      [quiz({ scheduledStart: new Date("2026-05-25T10:11:00.000Z") })],
      now,
    ).mode,
    "idle",
  );
});

test("live quiz is warm", () => {
  assert.equal(
    decideCapacityMode([quiz({ status: "LIVE", scheduledStart: now })], now)
      .mode,
    "warm",
  );
});

test("recently ended quiz is warm", () => {
  assert.equal(
    decideCapacityMode(
      [
        quiz({
          status: "ENDED",
          scheduledStart: new Date("2026-05-25T09:45:00.000Z"),
          endedAt: new Date("2026-05-25T09:55:00.000Z"),
        }),
      ],
      now,
    ).mode,
    "warm",
  );
});

test("quiz ended after cooldown is idle", () => {
  assert.equal(
    decideCapacityMode(
      [
        quiz({
          status: "ENDED",
          scheduledStart: new Date("2026-05-25T09:30:00.000Z"),
          endedAt: new Date("2026-05-25T09:49:00.000Z"),
        }),
      ],
      now,
    ).mode,
    "idle",
  );
});

test("scheduled quiz waiting for quorum after cooldown is idle", () => {
  assert.equal(
    decideCapacityMode(
      [quiz({ scheduledStart: new Date("2026-05-25T09:49:00.000Z") })],
      now,
    ).mode,
    "idle",
  );
});

test("NATS lag failure prevents downscale from warm state", () => {
  assert.equal(
    guardIdleDownscale(
      { mode: "idle", reasons: [] },
      true,
      { status: "unavailable", reason: "test outage" },
    ).mode,
    "warm",
  );
});

test("score-worker lag prevents downscale from warm state", () => {
  assert.equal(
    guardIdleDownscale(
      { mode: "idle", reasons: [] },
      true,
      { status: "ok", pending: 1, ackPending: 0 },
    ).mode,
    "warm",
  );
});

test("idle remains idle when already idle even if NATS is unavailable", () => {
  assert.equal(
    guardIdleDownscale(
      { mode: "idle", reasons: [] },
      false,
      { status: "unavailable", reason: "not needed" },
    ).mode,
    "idle",
  );
});
