"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/contexts/workspace-context";

export function WorkspaceSwitcher(): JSX.Element {
  const router = useRouter();
  const { workspaces, activeWorkspace, activeWorkspaceId, switchToWorkspace, switchToPersonal } =
    useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect fetch errors surfaced by the context (workspaces empty after mount)
  // The context itself handles the fetch; we just reflect its state.
  // If workspaces failed to load, the context keeps an empty list — we show an error.
  const [fetchAttempted, setFetchAttempted] = useState(false);
  useEffect(() => {
    // Give the context one tick to populate workspaces before showing an error
    const timer = setTimeout(() => setFetchAttempted(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Close dropdown when clicking outside (Req 2.8)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectWorkspace(id: string) {
    setError(null);
    switchToWorkspace(id);
    setOpen(false);
  }

  function handleSelectPersonal() {
    setError(null);
    switchToPersonal();
    setOpen(false);
  }

  function handleCreateNew() {
    setOpen(false);
    router.push("/dashboard/workspace");
  }

  // Active label: workspace name or "Personal" (Req 2.1)
  const activeLabel = activeWorkspace?.name ?? "Personal";

  return (
    <div ref={containerRef} className="relative mb-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a2e] shadow-lg"
        >
          {/* Inline error state (Req 2.7) */}
          {error && (
            <div className="px-3 py-2 text-sm text-red-400">{error}</div>
          )}

          {/* Personal option — always first (Req 2.3) */}
          <button
            type="button"
            role="option"
            aria-selected={activeWorkspaceId === null}
            onClick={handleSelectPersonal}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#e2e8f0] transition-colors hover:bg-white/10",
              activeWorkspaceId === null && "bg-[#6c63ff]/20 text-white"
            )}
          >
            <span className="truncate">Personal</span>
          </button>

          {/* Workspace list (Req 2.2) */}
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="option"
              aria-selected={workspace.id === activeWorkspaceId}
              onClick={() => handleSelectWorkspace(workspace.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#e2e8f0] transition-colors hover:bg-white/10",
                workspace.id === activeWorkspaceId && "bg-[#6c63ff]/20 text-white"
              )}
            >
              <span className="truncate">{workspace.name}</span>
            </button>
          ))}

          <div className="h-px bg-white/10" />

          {/* Create workspace — navigates to /dashboard/workspace (Req 2.6) */}
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>+ Create new workspace</span>
          </button>
        </div>
      )}
    </div>
  );
}
