"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWorkspace } from "@/features/workspaces/api";
import type { WorkspaceRecord } from "@/features/workspaces/types";
import {
  WorkspaceMemberPicker,
  type SelectedWorkspaceMember
} from "@/components/workspace/WorkspaceMemberPicker";

type CreateWorkspaceModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (workspace: WorkspaceRecord) => void;
};

export function CreateWorkspaceModal({
  open,
  onClose,
  onCreated
}: CreateWorkspaceModalProps) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<SelectedWorkspaceMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setName("");
      setMembers([]);
      setError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        const workspace = await createWorkspace({
          name,
          members: members.map((member) => ({
            userId: member.userId,
            role: member.role
          }))
        });
        onCreated(workspace);
        onClose();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Failed to create workspace."
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-[28px] border border-[#d8dcff] bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f1efff] text-[#6c63ff]">
            <Plus className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[#111827]">Create Workspace</h3>
            <p className="text-sm leading-6 text-[#6b7280]">
              Create a shared team space for collaborative meeting history, members, and workspace-specific sessions.
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <label htmlFor="workspace-name" className="text-sm font-medium text-[#111827]">
            Workspace Name
          </label>
          <input
            id="workspace-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#6c63ff]"
            placeholder="Product Team"
          />
        </div>
        <div className="mt-5">
          <WorkspaceMemberPicker
            label="Invite Members"
            selectedMembers={members}
            onChange={setMembers}
          />
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
          <Button type="button" onClick={handleSubmit} disabled={isPending || name.trim().length < 2}>
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Workspace
          </Button>
        </div>
      </div>
    </div>
  );
}
