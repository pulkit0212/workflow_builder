"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/contexts/workspace-context";

export function WorkspaceSwitcher(): React.ReactElement {
  const router = useRouter();
  const { workspaces, activeWorkspace, activeWorkspaceId, switchToWorkspace, switchToPersonal } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectWorkspace(id: string) {
    switchToWorkspace(id);
    setOpen(false);
  }

  function handleSelectPersonal() {
    switchToPersonal();
    setOpen(false);
  }

  function handleCreateNew() {
    setOpen(false);
    router.push("/dashboard/workspace");
  }

  const activeLabel = activeWorkspace?.name ?? "Personal";

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-3 p-2 rounded-lg bg-[#F1F3F4] cursor-pointer border border-[#DADCE0] hover:bg-[#E8EAED] transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="w-8 h-8 rounded bg-[#6C3FF5] flex items-center justify-center text-white shrink-0">
          <span className="material-symbols-outlined text-lg">workspace_premium</span>
        </div>
        <div className="overflow-hidden flex-1 text-left">
          <h1 className="text-sm font-bold text-[#6C3FF5] truncate">Artivaa AI</h1>
          <p className="text-[10px] text-[#5F6368] font-medium uppercase tracking-wider truncate">{activeLabel}</p>
        </div>
        <span className="material-symbols-outlined text-[#5F6368] shrink-0">unfold_more</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg"
        >
          {/* Personal option */}
          <button
            type="button"
            role="option"
            aria-selected={activeWorkspaceId === null}
            onClick={handleSelectPersonal}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[#F1F3F4]",
              activeWorkspaceId === null ? "bg-[#EDE9FE] text-[#6C3FF5] font-semibold" : "text-[#202124]"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
            <span>Personal</span>
            {activeWorkspaceId === null && (
              <span className="material-symbols-outlined text-[16px] ml-auto">check</span>
            )}
          </button>

          {/* Workspace list */}
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="option"
              aria-selected={workspace.id === activeWorkspaceId}
              onClick={() => handleSelectWorkspace(workspace.id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[#F1F3F4]",
                workspace.id === activeWorkspaceId ? "bg-[#EDE9FE] text-[#6C3FF5] font-semibold" : "text-[#202124]"
              )}
            >
              <span className="material-symbols-outlined text-[18px]">group</span>
              <span className="truncate">{workspace.name}</span>
              {workspace.id === activeWorkspaceId && (
                <span className="material-symbols-outlined text-[16px] ml-auto">check</span>
              )}
            </button>
          ))}

          <div className="h-px bg-[#DADCE0]" />

          {/* Create workspace */}
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#6C3FF5] transition-colors hover:bg-[#EDE9FE]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Create workspace</span>
          </button>
        </div>
      )}
    </div>
  );
}
