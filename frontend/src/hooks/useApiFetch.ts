"use client";

import { useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { createApiFetch } from "@/lib/api-client";
import { useWorkspaceContext } from "@/contexts/workspace-context";

/**
 * useApiFetch — returns an authenticated fetch function.
 * Uses useAuth().getToken() which is always available once Clerk loads.
 */
export function useApiFetch(): (
  path: string,
  init?: RequestInit & { workspaceId?: string }
) => Promise<Response> {
  const { getToken } = useAuth();
  const { activeWorkspaceId } = useWorkspaceContext();

  const stableGetToken = useCallback(async (): Promise<string | null> => {
    try {
      return await getToken();
    } catch {
      return null;
    }
  }, [getToken]);

  const apiFetch = createApiFetch(stableGetToken);

  return useCallback(
    (path: string, init?: RequestInit & { workspaceId?: string }) => {
      const workspaceId = init?.workspaceId ?? activeWorkspaceId ?? undefined;
      return apiFetch(path, { ...init, workspaceId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableGetToken, activeWorkspaceId]
  );
}

/**
 * useIsAuthReady — returns true once Clerk has finished loading.
 * Use this to gate useEffect data fetching.
 */
export function useIsAuthReady(): boolean {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && !!isSignedIn;
}
