"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  disconnectGoogleIntegration,
  fetchGoogleCalendarMeetings,
  fetchGoogleIntegrationStatus
} from "@/features/integrations/api";
import type { GoogleIntegrationStatus } from "@/features/integrations/types";
import type { GoogleCalendarMeeting } from "@/lib/google/types";

export function useGoogleIntegration() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [meetings, setMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);

    try {
      const nextStatus = await fetchGoogleIntegrationStatus();
      setStatus(nextStatus);

      if (nextStatus.connected) {
        try {
          const nextMeetings = await fetchGoogleCalendarMeetings();
          setMeetings(nextMeetings);
        } catch (calendarError) {
          const errorWithStatus = calendarError as Error & { status?: number };

          if (errorWithStatus.status === 404) {
            setMeetings([]);
          } else {
            throw calendarError;
          }
        }
      } else {
        setMeetings([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Google integration.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const googleStatus = searchParams.get("google");

    if (!googleStatus) {
      return;
    }

    if (googleStatus === "connect_failed") {
      setActionError("Google account connection failed. Try again.");
    } else if (googleStatus === "missing_context") {
      setActionError("Google connection context expired. Start the connection flow again.");
    } else if (googleStatus === "connected") {
      setActionError(null);
      void load();
    }
  }, [searchParams]);

  function connect() {
    void signIn("google", {
      callbackUrl: "/dashboard/meetings"
    });
  }

  function disconnect() {
    setActionError(null);

    startTransition(async () => {
      try {
        await disconnectGoogleIntegration();
        setStatus({
          provider: "google",
          connected: false,
          expiry: null
        });
        setMeetings([]);
      } catch (disconnectError) {
        setActionError(
          disconnectError instanceof Error ? disconnectError.message : "Failed to disconnect Google."
        );
      }
    });
  }

  return {
    status,
    meetings,
    isLoading,
    isPending,
    error,
    actionError,
    connect,
    disconnect
  };
}
