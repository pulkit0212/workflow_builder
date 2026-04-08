import { useCallback } from 'react';
import { useWorkspaceContext } from '@/contexts/workspace-context';

/**
 * Returns a fetch wrapper that automatically appends the `x-workspace-id`
 * header when `activeWorkspaceId` is non-null (workspace mode).
 * In personal mode no header is added.
 */
export function useWorkspaceFetch(): (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response> {
  const { activeWorkspaceId } = useWorkspaceContext();

  return useCallback(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (!activeWorkspaceId) {
        return fetch(input, init);
      }

      const headers = new Headers(init?.headers);
      headers.set('x-workspace-id', activeWorkspaceId);

      return fetch(input, { ...init, headers });
    },
    [activeWorkspaceId]
  );
}
