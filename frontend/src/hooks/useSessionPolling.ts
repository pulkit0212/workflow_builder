"use client";

import { useEffect, useRef, useState } from "react";
import type { MeetingStatusResponse } from "@/features/meetings/types";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

const BASE_INTERVAL = 2000;
const MAX_INTERVAL = 30000;

export function useSessionPolling(meetingId: string | null) {
  const [session, setSession] = useState<MeetingStatusResponse | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveErrors = useRef(0);
  const currentInterval = useRef(BASE_INTERVAL);
  const stoppedRef = useRef(false);
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();

  useEffect(() => {
    if (!meetingId || !isAuthReady) {
      setSession(null);
      return;
    }

    stoppedRef.current = false;
    consecutiveErrors.current = 0;
    currentInterval.current = BASE_INTERVAL;

    const poll = async () => {
      if (stoppedRef.current) return;

      try {
        const response = await apiFetch(`/api/meetings/${meetingId}/status`, { cache: "no-store" });
        if (!response.ok) {
          // Treat non-ok as an error for backoff purposes
          consecutiveErrors.current += 1;
          currentInterval.current = Math.min(currentInterval.current * 2, MAX_INTERVAL);
        } else {
          const data = (await response.json()) as MeetingStatusResponse;
          setSession(data);

          // Reset backoff on success
          consecutiveErrors.current = 0;
          currentInterval.current = BASE_INTERVAL;

          const activeStates = new Set(["joining", "waiting_for_join", "waiting_for_admission", "joined", "capturing", "processing", "summarizing"]);
          // Keep polling after completion until insights are available (max ~30s)
          const isTerminal = !activeStates.has(data.state);
          const insightsReady = data.state === "completed" ? Boolean(data.insights) : true;
          if (isTerminal && insightsReady) {
            stoppedRef.current = true;
            return;
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
        consecutiveErrors.current += 1;
        currentInterval.current = Math.min(currentInterval.current * 2, MAX_INTERVAL);
      }

      if (!stoppedRef.current) {
        timeoutRef.current = setTimeout(() => { void poll(); }, currentInterval.current);
      }
    };

    void poll();

    return () => {
      stoppedRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [meetingId, isAuthReady]);

  return session;
}
