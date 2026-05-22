import type { FastifyBaseLogger } from "fastify";
import { consumeAcceptedAnswers, stopNats, type AcceptedAnswerEvent } from "./nats.js";
import { enqueuePostAnswerBroadcasts } from "./broadcast-queue.js";
import { refreshLiveScoreForPlayer } from "./live-score.service.js";

export async function startScoreWorker(log?: FastifyBaseLogger): Promise<{
  stop: () => Promise<void>;
}> {
  const consumer = await consumeAcceptedAnswers(handleAcceptedAnswer, log);
  if (!consumer) {
    log?.warn("score worker: NATS unavailable; no answer stream consumer started");
  } else {
    log?.info("score worker: consuming accepted answers");
  }

  return {
    stop: async () => {
      await stopNats([consumer]);
    },
  };
}

async function handleAcceptedAnswer(event: AcceptedAnswerEvent): Promise<void> {
  await refreshLiveScoreForPlayer(event.quizId, event.roomPlayerId);
  enqueuePostAnswerBroadcasts({
    quizId: event.quizId,
    questionId: event.questionId,
  });
}
