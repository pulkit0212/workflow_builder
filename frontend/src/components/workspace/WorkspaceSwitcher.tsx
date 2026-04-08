"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getActiveWorkspaceId, setActiveWorkspaceId, workspaceFetch } from "@/lib/workspace-fetch";

type Workspace = {
  id: string;
  name: string;
  role: string;
};

export function WorkspaceSwitcher(): JSX.Element {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const res = await workspaceFetch("/api/workspaces");
        if (!res.ok) return;
        const data = (await res.json()) as { workspaces?: Workspace[] };
        const list = data.workspaces ?? [];
        setWorkspaces(list);

        const storedId = getActiveWorkspaceId();
        const match = list.find((w) => w.id === storedId) ?? list[0] ?? null;
        if (match) {
          setActiveWorkspace(match);
          if (!storedId || storedId !== match.id) {
            setActiveWorkspaceId(match.id);
          }
        }
      } catch {
        // silently ignore — sidebar should not crash on fetch failure
      }
    }

    void loadWorkspaces();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(workspace: Workspace) {
    setActiveWorkspaceId(workspace.id);
    setActiveWorkspace(workspace);
    setOpen(false);
    router.refresh();
  }

  function handleCreateNew() {
    setOpen(false);
    router.push("/dashboard/workspaces");
  }

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
        <span className="truncate">{activeWorkspace?.name ?? "Select workspace"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a2e] shadow-lg"
        >
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="option"
              aria-selected={workspace.id === activeWorkspace?.id}
              onClick={() => handleSelect(workspace)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#e2e8f0] transition-colors hover:bg-white/10",
                workspace.id === activeWorkspace?.id && "bg-[#6c63ff]/20 text-white"
              )}
            >
              <span className="truncate">{workspace.name}</span>
            </button>
          ))}

          <div className="h-px bg-white/10" />

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
