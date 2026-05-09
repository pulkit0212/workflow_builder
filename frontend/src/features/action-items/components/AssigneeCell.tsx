"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useApiFetch } from "@/hooks/useApiFetch";
import type { ActionItemRow, WorkspaceRole } from "@/app/dashboard/action-items/page";

type AssigneeCellProps = {
  item: ActionItemRow;
  currentUserId: string | null;
  currentUserName: string | null;
  role: WorkspaceRole;
  activeWorkspaceId: string | null;
  onUpdate: (id: string, assigneeId: string | null, assigneeName: string | null) => Promise<void>;
};

type UserResult = { id: string; full_name: string | null; email: string };

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

export function AssigneeCell({ item, currentUserId, currentUserName, role, activeWorkspaceId, onUpdate }: AssigneeCellProps) {
  const apiFetch = useApiFetch();

  // Display: assignee_name (from JOIN) if assignee_id is set, else item.assignee text (AI-extracted or "Unassigned")
  const isUnassigned = !item.assignee_id && (!item.assignee || item.assignee === "Unassigned");
  const displayName = item.assignee_id
    ? (item.assignee_name ?? item.assignee ?? "Unassigned")
    : (item.assignee || "Unassigned");
  const canEdit = role === "admin" || item.reporter_id === currentUserId;

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allUsers, setAllUsers] = useState<UserResult[]>([]);
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [updating, setUpdating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleOpen() {
    if (!canEdit) return;
    setOpen(true);
    setSearchQuery("");
    setSearchResults([]);
    // Load suggested users on open
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/users/search?q=a`, { workspaceId: activeWorkspaceId });
      const data = await res.json() as { users?: UserResult[] };
      setAllUsers(data.users ?? []);
    } catch {
      setAllUsers([]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`, { workspaceId: activeWorkspaceId });
        const data = await res.json() as { users?: UserResult[] };
        setSearchResults(data.users ?? []);
      } catch { setSearchResults([]); }
      finally { setIsSearching(false); }
    }, 300);
  }

  async function handleSelect(userId: string | null, name: string | null) {
    setOpen(false);
    setUpdating(true);
    try { await onUpdate(item.id, userId, name); }
    finally { setUpdating(false); }
  }

  // Displayed list: search results if searching, else allUsers (excluding current user since it's pinned)
  const listUsers = searchQuery.trim()
    ? searchResults
    : allUsers.filter((u) => u.id !== currentUserId);

  return (
    <div ref={containerRef} className="relative">
      {/* Display trigger */}
      <div
        className={`flex items-center ${canEdit ? "cursor-pointer" : "cursor-default"}`}
        onClick={() => void handleOpen()}
        role={canEdit ? "button" : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onKeyDown={(e) => { if (canEdit && (e.key === "Enter" || e.key === " ")) void handleOpen(); }}
      >
        {updating ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#9AA0A6]" />
        ) : (
          <div className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${canEdit ? "hover:bg-[#F1F3F4]" : ""}`}>
            {isUnassigned ? (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F1F3F4] text-[11px] font-bold text-[#9AA0A6]">?</div>
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#6C3FF5] text-[11px] font-bold text-white">
                {getInitials(displayName)}
              </div>
            )}
            <span className={`text-sm truncate max-w-[90px] ${isUnassigned ? "text-[#9AA0A6] italic" : "text-[#202124]"}`}>
              {displayName}
            </span>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-xl">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-[#DADCE0] px-3 py-2">
            <span className="material-symbols-outlined text-[14px] text-[#9AA0A6]">search</span>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search users…"
              className="flex-1 bg-transparent text-xs text-[#202124] outline-none placeholder:text-[#9AA0A6]"
            />
            {(isSearching || isLoading) && <Loader2 className="h-3 w-3 animate-spin text-[#9AA0A6]" />}
            <button type="button" onClick={() => setOpen(false)} className="text-[#9AA0A6] hover:text-[#5F6368]">
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {/* 1. Assign to me */}
            {currentUserId && (
              <button type="button"
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors ${item.assignee_id === currentUserId ? "bg-[#EDE9FE]/60" : "hover:bg-[#EDE9FE]/40"}`}
                onClick={() => void handleSelect(currentUserId, currentUserName)}>
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6C3FF5] text-[9px] font-bold text-white">
                  {getInitials(currentUserName || "Me")}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#6C3FF5]">{currentUserName || "Me"}</p>
                  <p className="text-[10px] text-[#9AA0A6]">Assign to me</p>
                </div>
                {item.assignee_id === currentUserId && (
                  <span className="ml-auto text-[#6C3FF5] text-[10px]">✓</span>
                )}
              </button>
            )}

            {/* 2. Unassigned */}
            <button type="button"
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors border-t border-[#F1F3F4] ${isUnassigned ? "bg-[#F8F9FA]" : "hover:bg-[#F8F9FA]"}`}
              onClick={() => void handleSelect(null, null)}>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F1F3F4] text-[9px] font-bold text-[#9AA0A6]">—</div>
              <div className="min-w-0">
                <p className="font-semibold text-[#5F6368]">Unassigned</p>
                <p className="text-[10px] text-[#9AA0A6]">Remove assignee</p>
              </div>
              {isUnassigned && <span className="ml-auto text-[#5F6368] text-[10px]">✓</span>}
            </button>

            {/* 3. User list */}
            {listUsers.length > 0 && (
              <div className="border-t border-[#F1F3F4]">
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6]">
                  {searchQuery.trim() ? "Results" : "Suggested"}
                </p>
                {listUsers.map((u) => (
                  <button key={u.id} type="button"
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA] transition-colors ${item.assignee_id === u.id ? "bg-[#F8F9FA]" : ""}`}
                    onClick={() => void handleSelect(u.id, u.full_name || u.email)}>
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[9px] font-bold text-[#6C3FF5]">
                      {getInitials(u.full_name || u.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#202124]">{u.full_name || u.email}</p>
                      {u.full_name && <p className="truncate text-[#9AA0A6]">{u.email}</p>}
                    </div>
                    {item.assignee_id === u.id && <span className="ml-auto text-[#6C3FF5] text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            )}

            {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
              <p className="px-3 py-3 text-xs text-[#9AA0A6] border-t border-[#F1F3F4]">No users found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
