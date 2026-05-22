"use client";

import { useEffect, useReducer, useRef } from "react";
import type { AdminLiveState, RoomEvent } from "@mini-quiz/shared";
import { adminApi } from "./admin-api";
import { useRoomEvents } from "./sse";

// All admin live-monitor state in one reducer. Anything that updates more than
// one field (e.g. a question advance updates id + position + distribution +
// answeredCount + clears the answer-count for the new question) goes through
// here so React doesn't render a half-applied state.

type State = {
  loading: boolean;
  error: string | null;
  live: AdminLiveState | null;
  // Local 1s-decremented copy of secondsRemaining so the KPI ticks down without
  // hitting the backend. Reset each time the server sends a fresh live-state.
  countdownAnchor: { atMs: number; serverSeconds: number } | null;
};

type Action =
  | { type: "loading" }
  | { type: "loaded"; state: AdminLiveState }
  | { type: "error"; message: string }
  | { type: "event"; event: RoomEvent }
  | { type: "tick" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "loading":
      return { ...s, loading: true };
    case "error":
      return { ...s, loading: false, error: a.message };
    case "loaded":
      return {
        loading: false,
        error: null,
        live: a.state,
        countdownAnchor:
          a.state.secondsRemaining != null
            ? { atMs: Date.now(), serverSeconds: a.state.secondsRemaining }
            : null,
      };
    case "tick": {
      // No-op trigger; the consumer reads countdownAnchor + Date.now() directly.
      return { ...s };
    }
    case "event": {
      if (!s.live) return s;
      const e = a.event;
      switch (e.type) {
        case "leaderboard":
          return { ...s, live: { ...s.live, leaderboard: e.rows } };
        case "answer_distribution": {
          const advanced = e.questionId !== s.live.currentQuestionId;
          return {
            ...s,
            live: {
              ...s.live,
              currentQuestionId: e.questionId,
              currentQuestionPosition: e.questionPosition,
              // Server doesn't send prompt/choices in the event; if the question
              // advanced we'll need a refetch — see effect below.
              distribution: e.distribution,
              answeredCount: e.answeredCount,
              ...(advanced ? { answeredCount: e.answeredCount } : {}),
            },
          };
        }
        case "player_joined":
          return {
            ...s,
            live: { ...s.live, activePlayers: s.live.activePlayers + 1 },
          };
        case "lobby_updated":
          return {
            ...s,
            live: { ...s.live, activePlayers: e.playerCount },
          };
        case "quiz_started":
          return {
            ...s,
            live: { ...s.live, status: "LIVE" },
            countdownAnchor: null, // server will send fresh seconds on next refetch
          };
        case "quiz_ended":
          return {
            ...s,
            live: { ...s.live, status: "ENDED", secondsRemaining: 0 },
            countdownAnchor: null,
          };
        default:
          return s;
      }
    }
    default:
      return s;
  }
}

export function useLiveState(quizId: string | null, quizCode: string | null) {
  const [state, dispatch] = useReducer(reducer, {
    loading: true,
    error: null,
    live: null,
    countdownAnchor: null,
  });

  // Track the currentQuestionId we've fetched full prompt/choices for. When
  // the SSE answer_distribution arrives for a *new* question, we need to
  // refetch live-state so the prompt/choices are correct on the wire.
  const seenQuestionIdRef = useRef<string | null>(null);

  // Initial + on-demand hydrate. Cheap; runs on mount and whenever the
  // question id we have on screen drifts from what SSE is reporting.
  useEffect(() => {
    if (!quizId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await adminApi.get<AdminLiveState>(
          `/admin/quizzes/${quizId}/live-state`,
        );
        if (cancelled) return;
        seenQuestionIdRef.current = data.currentQuestionId;
        dispatch({ type: "loaded", state: data });
      } catch (e) {
        if (!cancelled)
          dispatch({
            type: "error",
            message: e instanceof Error ? e.message : "Load failed",
          });
      }
    };
    void load();
    // Sparse safety-net poll. SSE is the primary source; this catches dropped
    // connections + question-advance fetches (we'll cancel + refetch eagerly
    // on the question-id-drift effect below).
    const id = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [quizId]);

  // Refetch when the SSE-reported currentQuestionId drifts from what we have
  // hydrated. This pulls fresh prompt/choices for the new question.
  useEffect(() => {
    if (!quizId || !state.live?.currentQuestionId) return;
    if (state.live.currentQuestionId === seenQuestionIdRef.current) return;
    seenQuestionIdRef.current = state.live.currentQuestionId;
    let cancelled = false;
    (async () => {
      try {
        const data = await adminApi.get<AdminLiveState>(
          `/admin/quizzes/${quizId}/live-state`,
        );
        if (!cancelled) dispatch({ type: "loaded", state: data });
      } catch {
        // Sparse poll will retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, state.live?.currentQuestionId]);

  // 1s ticker — drives the KPI countdown rerender.
  useEffect(() => {
    if (!state.countdownAnchor) return;
    const id = setInterval(() => dispatch({ type: "tick" }), 1_000);
    return () => clearInterval(id);
  }, [state.countdownAnchor]);

  // Subscribe to SSE for this quiz code.
  useRoomEvents(quizCode, (event) => {
    dispatch({ type: "event", event });
  });

  // Compute the live secondsRemaining off the anchor + clock.
  const secondsRemaining = (() => {
    if (state.live?.status !== "LIVE") return state.live?.secondsRemaining ?? null;
    if (!state.countdownAnchor) return state.live?.secondsRemaining ?? null;
    const elapsed = Math.floor(
      (Date.now() - state.countdownAnchor.atMs) / 1000,
    );
    return Math.max(0, state.countdownAnchor.serverSeconds - elapsed);
  })();

  return {
    loading: state.loading,
    error: state.error,
    live: state.live,
    secondsRemaining,
  };
}
