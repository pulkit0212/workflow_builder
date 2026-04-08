"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { SectionHeader } from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Users, Loader2, Trash2, LogOut, Crown, Shield, User } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Member = {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    fullName: string | null;
    email: string | null;
  };
};

type JoinRequest = {
  id: string;
  workspaceId: string;
  userId: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    fullName: string | null;
    email: string | null;
  };
};

type WorkspaceData = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  currentUserRole: string;
  members: Member[];
  joinRequests: JoinRequest[];
};

// ---------------------------------------------------------------------------
// Role icon helper
// ---------------------------------------------------------------------------

function RoleIcon({ role }: { role: string }) {
  if (role === "owner") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
  if (role === "admin") return <Shield className="h-3.5 w-3.5 text-blue-500" />;
  return <User className="h-3.5 w-3.5 text-slate-400" />;
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function WorkspaceManagementPage() {
  const router = useRouter();
  const { activeWorkspaceId, switchToPersonal } = useWorkspaceContext();

  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [newName, setNewName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  // Transfer ownership state
  const [transferMemberId, setTransferMemberId] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Action feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Redirect when no active workspace (Req 8.11)
  useEffect(() => {
    if (activeWorkspaceId === null) {
      router.replace("/dashboard");
    }
  }, [activeWorkspaceId, router]);

  const fetchWorkspace = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError((payload as { message?: string }).message ?? "Failed to load workspace.");
        return;
      }
      const payload = await res.json() as { workspace: WorkspaceData };
      setData(payload.workspace);
      setNewName(payload.workspace.name);
    } catch {
      setError("Failed to load workspace.");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  if (activeWorkspaceId === null) return null;

  const isOwner = data?.currentUserRole === "owner";
  const isAdmin = data?.currentUserRole === "admin";
  const canManage = isOwner || isAdmin;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !newName.trim()) return;
    setNameLoading(true);
    setNameError(null);
    setNameSuccess(false);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setNameError((payload as { message?: string }).message ?? "Failed to update name.");
        return;
      }
      setNameSuccess(true);
      await fetchWorkspace();
    } catch {
      setNameError("Failed to update name.");
    } finally {
      setNameLoading(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!activeWorkspaceId) return;
    setActionLoading(memberId);
    setActionError(null);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members/${memberId}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setActionError((payload as { message?: string }).message ?? "Failed to remove member.");
        return;
      }
      await fetchWorkspace();
    } catch {
      setActionError("Failed to remove member.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleChangeRole(memberId: string, role: string) {
    if (!activeWorkspaceId) return;
    setActionLoading(memberId);
    setActionError(null);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setActionError((payload as { message?: string }).message ?? "Failed to change role.");
        return;
      }
      await fetchWorkspace();
    } catch {
      setActionError("Failed to change role.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleJoinRequest(requestId: string, action: "accept" | "reject") {
    if (!activeWorkspaceId) return;
    setActionLoading(requestId);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspaceId}/join-requests/${requestId}/${action}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setActionError((payload as { message?: string }).message ?? `Failed to ${action} request.`);
        return;
      }
      await fetchWorkspace();
    } catch {
      setActionError(`Failed to ${action} request.`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLeave() {
    if (!activeWorkspaceId || !confirm("Are you sure you want to leave this workspace?")) return;
    setActionLoading("leave");
    setActionError(null);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/leave`, { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setActionError((payload as { message?: string }).message ?? "Failed to leave workspace.");
        return;
      }
      switchToPersonal();
      router.replace("/dashboard");
    } catch {
      setActionError("Failed to leave workspace.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    if (!activeWorkspaceId || !confirm("Are you sure you want to permanently delete this workspace? This cannot be undone.")) return;
    setActionLoading("delete");
    setActionError(null);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setActionError((payload as { message?: string }).message ?? "Failed to delete workspace.");
        return;
      }
      switchToPersonal();
      router.replace("/dashboard");
    } catch {
      setActionError("Failed to delete workspace.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTransferOwnership(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !transferMemberId) return;
    setTransferLoading(true);
    setTransferError(null);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerMemberId: transferMemberId })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setTransferError((payload as { message?: string }).message ?? "Failed to transfer ownership.");
        return;
      }
      setTransferMemberId("");
      await fetchWorkspace();
    } catch {
      setTransferError("Failed to transfer ownership.");
    } finally {
      setTransferLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Manage Workspace"
        description="Members, roles, join requests, and workspace settings."
      />

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#6c63ff]" />
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-800">{error}</p>
        </Card>
      )}

      {!loading && data && (
        <div className="space-y-8">
          {actionError && (
            <Card className="border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">{actionError}</p>
            </Card>
          )}

          {/* Update workspace name — owner only */}
          {isOwner && (
            <Card className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Workspace Name</h2>
              <form onSubmit={handleUpdateName} className="flex gap-3 items-start">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setNameSuccess(false); }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
                  placeholder="Workspace name"
                  disabled={nameLoading}
                />
                <button
                  type="submit"
                  disabled={nameLoading || !newName.trim()}
                  className="inline-flex h-9 items-center rounded-xl bg-[#6c63ff] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#5b52e0] disabled:opacity-50"
                >
                  {nameLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </button>
              </form>
              {nameError && <p className="text-sm text-red-600">{nameError}</p>}
              {nameSuccess && <p className="text-sm text-green-600">Name updated.</p>}
            </Card>
          )}

          {/* Members list */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <h2 className="text-base font-semibold text-slate-900">
                Members ({data.members.filter((m) => m.status === "active").length})
              </h2>
            </div>

            {data.members.length === 0 ? (
              <p className="text-sm text-slate-500">No members yet.</p>
            ) : (
              <div className="space-y-2">
                {data.members
                  .filter((m) => m.status === "active")
                  .map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5f3ff] text-xs font-semibold text-[#6c63ff]">
                          {(member.user.fullName ?? member.user.email ?? member.userId).slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {member.user.fullName ?? member.user.email ?? member.userId}
                          </p>
                          {member.user.email && member.user.fullName && (
                            <p className="truncate text-xs text-slate-500">{member.user.email}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5">
                          <RoleIcon role={member.role} />
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {member.role}
                          </span>
                        </div>

                        {/* Role change — owner/admin only, not for self-owner */}
                        {canManage && !(isOwner && member.role === "owner") && (
                          <select
                            value={member.role}
                            onChange={(e) => handleChangeRole(member.id, e.target.value)}
                            disabled={actionLoading === member.id}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40 disabled:opacity-50"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                        )}

                        {/* Remove member — owner/admin only, not self */}
                        {canManage && member.role !== "owner" && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={actionLoading === member.id}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Remove member"
                          >
                            {actionLoading === member.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          {/* Pending join requests — owner/admin only */}
          {canManage && (
            <Card className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">
                Pending Join Requests ({data.joinRequests.length})
              </h2>

              {data.joinRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No pending requests.</p>
              ) : (
                <div className="space-y-2">
                  {data.joinRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {req.user.fullName ?? req.user.email ?? req.userId}
                        </p>
                        {req.user.email && req.user.fullName && (
                          <p className="truncate text-xs text-slate-500">{req.user.email}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => handleJoinRequest(req.id, "accept")}
                          disabled={actionLoading === req.id}
                          className="inline-flex h-7 items-center rounded-lg bg-green-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Accept"}
                        </button>
                        <button
                          onClick={() => handleJoinRequest(req.id, "reject")}
                          disabled={actionLoading === req.id}
                          className="inline-flex h-7 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Transfer ownership — owner only */}
          {isOwner && data.members.filter((m) => m.status === "active" && m.role !== "owner").length > 0 && (
            <Card className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Transfer Ownership</h2>
              <p className="text-sm text-slate-500">
                Transfer ownership to another active member. You will become an admin.
              </p>
              <form onSubmit={handleTransferOwnership} className="flex gap-3 items-start">
                <select
                  value={transferMemberId}
                  onChange={(e) => setTransferMemberId(e.target.value)}
                  disabled={transferLoading}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40 disabled:opacity-50"
                >
                  <option value="">Select a member…</option>
                  {data.members
                    .filter((m) => m.status === "active" && m.role !== "owner")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.user.fullName ?? m.user.email ?? m.userId}
                      </option>
                    ))}
                </select>
                <button
                  type="submit"
                  disabled={transferLoading || !transferMemberId}
                  className="inline-flex h-9 items-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                >
                  {transferLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Transfer"}
                </button>
              </form>
              {transferError && <p className="text-sm text-red-600">{transferError}</p>}
            </Card>
          )}

          {/* Danger zone */}
          <Card className="border-red-200 p-6 space-y-4">
            <h2 className="text-base font-semibold text-red-800">Danger Zone</h2>

            {/* Leave workspace — non-owner members */}
            {!isOwner && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">Leave workspace</p>
                  <p className="text-xs text-slate-500">You will lose access to this workspace.</p>
                </div>
                <button
                  onClick={handleLeave}
                  disabled={actionLoading === "leave"}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {actionLoading === "leave" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Leave
                </button>
              </div>
            )}

            {/* Delete workspace — owner only */}
            {isOwner && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">Delete workspace</p>
                  <p className="text-xs text-slate-500">
                    Permanently delete this workspace and all its data. This cannot be undone.
                  </p>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading === "delete"}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading === "delete" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
