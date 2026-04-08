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
  role: 'owner' | 'admin' | 'member';
};

export type WorkspaceContextValue = {
  mode: WorkspaceMode;
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceInfo | null;
  workspaces: WorkspaceInfo[];
  switchToPersonal: () => void;
  switchToWorkspace: (id: string) => void;
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

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => {
    if (urlParam) return urlParam;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LS_KEY);
      return stored || null;
    }
    return null;
  });

  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);

  // ---------------------------------------------------------------------------
  // Sync URL when localStorage fallback is used on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!urlParam && activeWorkspaceId) {
      // localStorage had a value but URL didn't — sync to URL (Req 1.5)
      const params = new URLSearchParams(searchParams.toString());
      params.set('workspace', activeWorkspaceId);
      router.replace(`?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ---------------------------------------------------------------------------
  // Fetch workspace list on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetch('/api/workspaces')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { workspaces?: WorkspaceInfo[] }) => {
        const list: WorkspaceInfo[] = data.workspaces ?? [];
        setWorkspaces(list);

        // If stored workspace ID is no longer in the list, fall back to personal
        if (activeWorkspaceId) {
          const stillValid = list.some((w) => w.id === activeWorkspaceId);
          if (!stillValid) {
            localStorage.removeItem(LS_KEY);
            setActiveWorkspaceId(null);
            const params = new URLSearchParams(searchParams.toString());
            params.delete('workspace');
            const qs = params.toString();
            router.replace(qs ? `?${qs}` : window.location.pathname);
          }
        }
      })
      .catch(() => {
        // Fetch failed — keep current state, WorkspaceSwitcher will show error
      });
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
    router.replace(qs ? `?${qs}` : window.location.pathname);
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
