"use client";

import { useEffect, useRef, useState } from "react";
import type { MeetingStatusResponse } from "@/features/meetings/types";

export function useSessionPolling(meetingId: string | null) {
  const [session, setSession] = useState<MeetingStatusResponse | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!meetingId) {
      setSession(null);
      return;
    }

    const poll = async () => {
      try {
        const response = await fetch(`/api/meetings/${meetingId}/status`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as MeetingStatusResponse;
        setSession(data);

        if (["completed", "failed"].includes(data.state) && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    void poll();
    intervalRef.current = setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [meetingId]);

  return session;
}
