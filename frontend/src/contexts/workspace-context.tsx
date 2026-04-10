'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceMode = 'personal' | 'workspace';

export type WorkspaceInfo = {
  id: string;
  name: string;
  type: 'personal' | 'team';
  role: 'admin' | 'member' | 'viewer';
};

export type WorkspaceContextValue = {
  mode: WorkspaceMode;
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceInfo | null;
  workspaces: WorkspaceInfo[];
  switchToPersonal: () => void;
  switchToWorkspace: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_KEY = 'active-workspace-id';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve initial activeWorkspaceId:
  // 1. URL ?workspace param (authoritative)
  // 2. localStorage fallback
  // 3. null (personal mode)
  const urlParam = searchParams.get('workspace');

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    // Always start null on server — hydrate from localStorage in useEffect
    urlParam ?? null
  );

  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);

  // ---------------------------------------------------------------------------
  // Hydrate from localStorage on mount (after SSR)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (urlParam) return; // URL param is authoritative, already set
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      setActiveWorkspaceId(stored);
      const params = new URLSearchParams(searchParams.toString());
      params.set('workspace', stored);
      router.replace(`?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ---------------------------------------------------------------------------
  // Fetch workspace list
  // ---------------------------------------------------------------------------
  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces');
      if (!res.ok) return;
      const data = (await res.json()) as { workspaces?: WorkspaceInfo[] };
      const list: WorkspaceInfo[] = data.workspaces ?? [];
      setWorkspaces(list);

      // If active workspace is no longer in the list, fall back to personal
      setActiveWorkspaceId((current) => {
        if (current && !list.some((w) => w.id === current)) {
          localStorage.removeItem(LS_KEY);
          return null;
        }
        return current;
      });
    } catch {
      // keep current state on error
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const switchToWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspaceId(id);
      localStorage.setItem(LS_KEY, id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('workspace', id);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const switchToPersonal = useCallback(() => {
    setActiveWorkspaceId(null);
    localStorage.removeItem(LS_KEY);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('workspace');
    const qs = params.toString();
    router.replace((qs ? `?${qs}` : window.location.pathname) as never);
  }, [router, searchParams]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const activeWorkspace: WorkspaceInfo | null =
    activeWorkspaceId
      ? (workspaces.find((w) => w.id === activeWorkspaceId) ?? null)
      : null;

  const mode: WorkspaceMode = activeWorkspaceId ? 'workspace' : 'personal';

  return (
    <WorkspaceContext.Provider
      value={{
        mode,
        activeWorkspaceId,
        activeWorkspace,
        workspaces,
        switchToPersonal,
        switchToWorkspace,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return ctx;
}
