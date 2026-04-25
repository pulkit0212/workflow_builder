import { useApiFetch } from '@/hooks/useApiFetch';

/**
 * Returns a fetch wrapper that automatically appends the `x-workspace-id`
 * header when `activeWorkspaceId` is non-null (workspace mode).
 * In personal mode no header is added.
 *
 * @deprecated Use `useApiFetch` directly — it handles workspace context automatically.
 */
export function useWorkspaceFetch(): (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response> {
  return useApiFetch();
}
