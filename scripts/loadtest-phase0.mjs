#!/usr/bin/env node

const BASE_URL = process.env.PHASE0_BASE_URL ?? "http://localhost:4000";
const CODE = (process.env.PHASE0_CODE ?? "").toUpperCase();
const USERS = Number(process.env.PHASE0_USERS ?? "500");
const CONCURRENCY = Number(process.env.PHASE0_CONCURRENCY ?? "50");
const HOLD_MS = Number(process.env.PHASE0_SSE_HOLD_MS ?? "30000");
const ANSWER_QUESTIONS = Number(process.env.PHASE0_ANSWER_QUESTIONS ?? "1");

if (!CODE) {
  console.error("Set PHASE0_CODE to the quiz room code.");
  process.exit(1);
}

function walletFor(i) {
  return `0x${(BigInt(i + 1)).toString(16).padStart(40, "0")}`;
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function percentile(values, pct) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function request(path, options = {}) {
  const started = nowMs();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const ms = nowMs() - started;
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} ${path}`);
    error.status = res.status;
    error.body = body;
    error.ms = ms;
    throw error;
  }
  return { body, ms };
}

async function withConcurrency(items, limit, worker) {
  let next = 0;
  const results = [];
  async function run() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function connectSse(code, holdMs) {
  const controller = new AbortController();
  const started = nowMs();
  const timer = setTimeout(() => controller.abort(), holdMs);
  let firstEventMs = null;
  let events = 0;
  try {
    const res = await fetch(`${BASE_URL}/rooms/${code}/events`, {
      signal: controller.signal,
      headers: { accept: "text/event-stream" },
    });
    if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        if (!chunk.startsWith("data:")) continue;
        events += 1;
        if (firstEventMs === null) firstEventMs = nowMs() - started;
      }
    }
  } catch (e) {
    if (e?.name !== "AbortError") throw e;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return { firstEventMs, events };
}

async function main() {
  const users = Array.from({ length: USERS }, (_, i) => ({
    index: i,
    walletAddress: walletFor(i),
    username: `lt_${String(i).padStart(6, "0")}`.slice(0, 20),
    displayName: `Load ${i}`,
  }));

  const metrics = {
    onboardMs: [],
    joinMs: [],
    leaderboardMs: [],
    answerMs: [],
    sseFirstEventMs: [],
    sseEvents: 0,
    errors: [],
  };

  const quizRes = await request(`/quizzes/${CODE}`);
  const quiz = quizRes.body.quiz;
  const questions = quizRes.body.questions ?? [];

  console.log(
    JSON.stringify({
      baseUrl: BASE_URL,
      code: CODE,
      users: USERS,
      concurrency: CONCURRENCY,
      quizStatus: quiz.status,
      questions: questions.length,
    }),
  );

  await withConcurrency(users, CONCURRENCY, async (user) => {
    try {
      const onboard = await request("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          walletAddress: user.walletAddress,
          displayName: user.displayName,
          username: user.username,
          avatarEmoji: "\uD83D\uDC12",
          avatarColor: "primary",
        }),
      });
      metrics.onboardMs.push(onboard.ms);

      const joined = await request(`/rooms/${CODE}/join`, {
        method: "POST",
        body: JSON.stringify({ walletAddress: user.walletAddress }),
      });
      metrics.joinMs.push(joined.ms);

      const ssePromise = connectSse(CODE, HOLD_MS).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );

      const leaderboardParams = new URLSearchParams({
        limit: "50",
        viewerUserId: joined.body.userId,
      });
      const lb = await request(`/rooms/${CODE}/leaderboard?${leaderboardParams.toString()}`);
      metrics.leaderboardMs.push(lb.ms);

      if (quiz.status === "LIVE" && ANSWER_QUESTIONS > 0) {
        for (const question of questions.slice(0, ANSWER_QUESTIONS)) {
          const choiceId = question.choices?.[0]?.id ?? "";
          const answered = await request(`/rooms/${CODE}/answer`, {
            method: "POST",
            body: JSON.stringify({
              walletAddress: user.walletAddress,
              roomPlayerId: joined.body.roomPlayerId,
              questionId: question.id,
              choiceId,
              timeTakenMs: 1000,
            }),
          });
          metrics.answerMs.push(answered.ms);
        }
      }

      const sse = await ssePromise;
      if (sse.error) throw sse.error;
      if (sse.value.firstEventMs !== null) {
        metrics.sseFirstEventMs.push(sse.value.firstEventMs);
      }
      metrics.sseEvents += sse.value.events;
    } catch (e) {
      metrics.errors.push({
        user: user.index,
        message: e?.message ?? String(e),
        status: e?.status ?? null,
        body: e?.body ?? null,
      });
    }
  });

  const summary = {
    users: USERS,
    concurrency: CONCURRENCY,
    errors: metrics.errors.length,
    p95: {
      onboardMs: percentile(metrics.onboardMs, 95),
      joinMs: percentile(metrics.joinMs, 95),
      leaderboardMs: percentile(metrics.leaderboardMs, 95),
      answerMs: percentile(metrics.answerMs, 95),
      sseFirstEventMs: percentile(metrics.sseFirstEventMs, 95),
    },
    counts: {
      onboarded: metrics.onboardMs.length,
      joined: metrics.joinMs.length,
      leaderboard: metrics.leaderboardMs.length,
      answers: metrics.answerMs.length,
      sseEvents: metrics.sseEvents,
    },
    sampleErrors: metrics.errors.slice(0, 10),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (metrics.errors.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
