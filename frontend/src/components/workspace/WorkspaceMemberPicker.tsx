"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchUsers } from "@/features/workspaces/api";
import type {
  SearchableUser,
  WorkspaceRole
} from "@/features/workspaces/types";

export type SelectedWorkspaceMember = {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
};

type WorkspaceMemberPickerProps = {
  label: string;
  selectedMembers: SelectedWorkspaceMember[];
  onChange: (members: SelectedWorkspaceMember[]) => void;
  disallowedRoles?: WorkspaceRole[];
  actionLabel?: string;
};

const roleOptions: Array<{ value: WorkspaceRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" }
];

export function WorkspaceMemberPicker({
  label,
  selectedMembers,
  onChange,
  disallowedRoles = ["owner"],
  actionLabel = "Invite member"
}: WorkspaceMemberPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchableUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      void searchUsers(query)
        .then((users) => {
          const selectedIds = new Set(selectedMembers.map((member) => member.userId));
          setResults(users.filter((user) => !selectedIds.has(user.id)));
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query, selectedMembers]);

  const allowedRoles = roleOptions.filter((role) => !disallowedRoles.includes(role.value));

  function addMember(user: SearchableUser) {
    onChange([
      ...selectedMembers,
      {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: "member"
      }
    ]);
    setQuery("");
    setResults([]);
  }

  function updateRole(userId: string, role: WorkspaceRole) {
    onChange(
      selectedMembers.map((member) =>
        member.userId === userId
          ? {
              ...member,
              role
            }
          : member
      )
    );
  }

  function removeMember(userId: string) {
    onChange(selectedMembers.filter((member) => member.userId !== userId));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-[#111827]">{label}</label>
        <div className="rounded-[24px] border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <div className="flex items-center gap-3 rounded-2xl border border-white bg-white px-4 py-3">
            <Search className="h-4 w-4 text-[#9ca3af]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email"
              className="w-full border-0 bg-transparent p-0 text-sm text-[#111827] outline-none placeholder:text-[#9ca3af]"
            />
            {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin text-[#6c63ff]" /> : null}
          </div>
          {results.length > 0 ? (
            <div className="mt-3 space-y-2">
              {results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => addMember(user)}
                  className="flex w-full items-center justify-between rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-left transition hover:border-[#c7d2fe] hover:bg-[#f8faff]"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">{user.name}</p>
                    <p className="text-sm text-[#6b7280]">{user.email}</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold text-[#5b52ee]">
                    <UserPlus className="h-3.5 w-3.5" />
                    {actionLabel}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {selectedMembers.length > 0 ? (
        <div className="space-y-3">
          {selectedMembers.map((member) => (
            <div
              key={member.userId}
              className="flex flex-col gap-3 rounded-[24px] border border-[#e5e7eb] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#111827]">{member.name}</p>
                <p className="truncate text-sm text-[#6b7280]">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={member.role}
                  onChange={(event) => updateRole(member.userId, event.target.value as WorkspaceRole)}
                  className="rounded-xl border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#111827] outline-none"
                >
                  {allowedRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMember(member.userId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
