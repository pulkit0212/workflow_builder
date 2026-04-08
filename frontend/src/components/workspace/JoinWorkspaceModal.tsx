"use client";

import { useEffect, useState, useTransition } from "react";
import { DoorOpen, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  requestJoinWorkspace,
  searchJoinableWorkspaces
} from "@/features/workspaces/api";
import type {
  WorkspaceRecord,
  WorkspaceSearchRecord
} from "@/features/workspaces/types";

type JoinWorkspaceModalProps = {
  open: boolean;
  onClose: () => void;
  onJoined: (workspace: WorkspaceRecord) => void;
};

export function JoinWorkspaceModal({
  open,
  onClose,
  onJoined
}: JoinWorkspaceModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkspaceSearchRecord[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedWorkspaceId("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);
      void searchJoinableWorkspaces(query)
        .then((workspaces) => {
          setResults(workspaces);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  if (!open) {
    return null;
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        const workspace = await requestJoinWorkspace({ workspaceId: selectedWorkspaceId });
        onJoined(workspace);
        onClose();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Failed to join workspace."
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-[28px] border border-[#dbeafe] bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
            <DoorOpen className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[#111827]">Join Workspace</h3>
            <p className="text-sm leading-6 text-[#6b7280]">
              Enter a workspace ID shared by your team to unlock shared meetings and member access.
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <label htmlFor="workspace-query" className="text-sm font-medium text-[#111827]">
            Search Workspace Name
          </label>
          <div className="rounded-[24px] border border-[#e5e7eb] bg-[#f9fafb] p-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white bg-white px-4 py-3">
              <Search className="h-4 w-4 text-[#9ca3af]" />
              <input
                id="workspace-query"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedWorkspaceId("");
                  if (error) {
                    setError(null);
                  }
                }}
                className="w-full border-0 bg-transparent p-0 text-sm text-[#111827] outline-none placeholder:text-[#9ca3af]"
                placeholder="Search by workspace name"
              />
              {isSearching ? <LoaderCircle className="h-4 w-4 animate-spin text-[#2563eb]" /> : null}
            </div>
            {results.length > 0 ? (
              <div className="mt-3 space-y-2">
                {results.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => {
                      setSelectedWorkspaceId(workspace.id);
                      setQuery(workspace.name);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      selectedWorkspaceId === workspace.id
                        ? "border-[#93c5fd] bg-[#eff6ff]"
                        : "border-[#e5e7eb] bg-white hover:border-[#bfdbfe] hover:bg-[#f8fbff]"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">{workspace.name}</p>
                      <p className="text-sm text-[#6b7280]">
                        {workspace.memberCount} members • {workspace.meetingCount} meetings
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#2563eb]">
                      {workspace.hasPendingRequest ? "Requested" : "Select"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <p className="text-sm text-[#6b7280]">
            Selecting a workspace submits a join request for admin approval.
          </p>
        </div>
        {error ? (
          <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#991b1b]">
            {error}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !selectedWorkspaceId}>
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <DoorOpen className="h-4 w-4" />
            )}
            Request to Join
          </Button>
        </div>
      </div>
    </div>
  );
}
