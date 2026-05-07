"use client";

import { useEffect, useRef } from "react";
import type { RoomEvent } from "@mini-quiz/shared";
import { API_BASE_URL } from "./api-client";

export function useRoomEvents(
  code: string | null,
  onEvent: (event: RoomEvent) => void,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!code) return;
    const es = new EventSource(`${API_BASE_URL}/rooms/${code}/events`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as RoomEvent;
        onEventRef.current(data);
      } catch {
        // ignore malformed lines
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects on transient failures.
    };
    return () => es.close();
  }, [code]);
}
