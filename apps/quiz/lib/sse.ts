"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomEvent } from "@mini-quiz/shared";
import { API_BASE_URL } from "./api-client";

export type RoomEventConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "error"
  | "closed";

export function useRoomEvents(
  code: string | null,
  onEvent: (event: RoomEvent) => void,
): { connectionState: RoomEventConnectionState; lastMessageAt: number | null } {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [connectionState, setConnectionState] =
    useState<RoomEventConnectionState>("idle");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  useEffect(() => {
    if (!code) {
      setConnectionState("idle");
      setLastMessageAt(null);
      return;
    }
    setConnectionState("connecting");
    const es = new EventSource(`${API_BASE_URL}/rooms/${code}/events`);
    es.onopen = () => {
      setConnectionState("open");
      setLastMessageAt(Date.now());
    };
    es.onmessage = (e) => {
      try {
        setConnectionState("open");
        setLastMessageAt(Date.now());
        const data = JSON.parse(e.data) as RoomEvent;
        onEventRef.current(data);
      } catch {
        // ignore malformed lines
      }
    };
    es.onerror = () => {
      setConnectionState("error");
      // EventSource auto-reconnects on transient failures.
    };
    return () => {
      es.close();
    };
  }, [code]);

  return { connectionState, lastMessageAt };
}
