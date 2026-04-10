"use client";

import { InviteMembersCard } from "@/components/workspace/InviteMembersCard";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { Card } from "@/components/ui/card";
import {
  Users, Loader2, Trash2, LogOut, Shield, User, Eye,
  Plus, ArrowRight
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkspaceListItem = {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  meetingCount: number;
  createdAt: string;
};

type Member = {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string | null };
};

type WorkspaceData = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  currentUserRole: string;
  members: Member[];
  joinRequests: unknown[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string }) {
  if (role === "admin") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#6c63ff]/10 px-2 py-0.5 text-[11px] font-semibold text-[#6c63ff] ring-1 ring-[#6c63ff]/20">
      <Shield className="h-3 w-3" /> Admin
    </span>
  );
  if (role === "member") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
      <User className="h-3 w-3" /> Member
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-400 ring-1 ring-slate-200">
      <Eye className="h-3 w-3" /> Viewer
    </span>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.slice(0, 2).toUpperCase();
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-11 w-11 text-base" };
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6c63ff] to-[#9b8fff] font-semibold text-white ${sizes[size]}`}>
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Workspace List View
// ---------------------------------------------------------------------------

function WorkspaceListView() {
  const router = useRouter();
  const { switchToWorkspace, refreshWorkspaces } = useWorkspaceContext();
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) throw new Error("Failed to load workspaces.");
      const data = await res.json() as { workspaces: WorkspaceListItem[] };
      setWorkspaces(data.workspaces ?? []);
    } catch {
      setError("Failed to load workspaces.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), members: [] }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setCreateError((payload as { message?: string }).message ?? "Failed to create workspace.");
        return;
      }
      const payload = await res.json() as { workspace: WorkspaceListItem };
      setNewName("");
      setShowCreate(false);
      await refreshWorkspaces();          // update switcher list first
      switchToWorkspace(payload.workspace.id); // then select the new workspace
      router.refresh();
    } catch {
      setCreateError("Failed to create workspace.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Your Workspaces</h1>
          <p className="mt-1 text-sm text-slate-400">Collaborate with your team across shared meetings and notes.</p>
        </div>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#6c63ff] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#6c63ff]/30 transition-all hover:bg-[#5b52e0] hover:shadow-md hover:shadow-[#6c63ff]/20">
            <Plus className="h-4 w-4" /> New Workspace
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl border border-[#6c63ff]/20 bg-gradient-to-br from-[#faf9ff] to-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6c63ff]/10">
              <Plus className="h-4 w-4 text-[#6c63ff]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Create a new workspace</p>
              <p className="text-xs text-slate-400">Give your team a shared space for meetings and notes.</p>
            </div>
          </div>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Product Team, Design, Engineering…"
              disabled={creating} autoFocus
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
            />
            <button type="submit" disabled={creating || !newName.trim()}
              className="inline-flex h-10 items-center rounded-xl bg-[#6c63ff] px-5 text-sm font-semibold text-white hover:bg-[#5b52e0] disabled:opacity-50 transition-colors">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </button>
            <button type="button" onClick={() => { setShowCreate(false); setNewName(""); setCreateError(null); }}
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </form>
          {createError && <p className="mt-2 text-xs text-red-600">{createError}</p>}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-[#6c63ff]" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && workspaces.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <Users className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-base font-semibold text-slate-700">No workspaces yet</p>
          <p className="mt-1 text-sm text-slate-400">Create your first workspace to start collaborating.</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#6c63ff] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5b52e0] transition-colors">
            <Plus className="h-4 w-4" /> Create Workspace
          </button>
        </div>
      )}

      {/* Workspace grid */}
      {!loading && workspaces.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((ws) => (
            <button key={ws.id} onClick={() => switchToWorkspace(ws.id)}
              className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-[#6c63ff]/50 hover:bg-[#faf9ff] hover:shadow-lg hover:shadow-[#6c63ff]/10 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40">

              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <Avatar name={ws.name} size="md" />
                <RoleBadge role={ws.role} />
              </div>

              {/* Name */}
              <p className="mt-3 text-base font-bold text-slate-900 truncate">{ws.name}</p>

              {/* Stats */}
              <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {ws.memberCount} member{ws.memberCount !== 1 ? "s" : ""}
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-200" />
                <span>{ws.meetingCount} meeting{ws.meetingCount !== 1 ? "s" : ""}</span>
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400">
                  {new Date(ws.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6c63ff] opacity-0 transition-opacity group-hover:opacity-100">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}

          {/* Add new card */}
          {!showCreate && (
            <button onClick={() => setShowCreate(true)}
              className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center transition-all hover:border-[#6c63ff]/40 hover:bg-[#faf9ff] focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40 min-h-[160px]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 transition-colors group-hover:bg-[#6c63ff]/10">
                <Plus className="h-5 w-5 text-slate-400" />
              </div>
              <p className="mt-2.5 text-sm font-semibold text-slate-500">New Workspace</p>
              <p className="mt-0.5 text-xs text-slate-400">Create a team space</p>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace Management View
// ---------------------------------------------------------------------------

function WorkspaceManagementView({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { switchToPersonal, refreshWorkspaces } = useWorkspaceContext();

  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [transferMemberId, setTransferMemberId] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null); // clear stale data immediately on each fetch
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`);
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
  }, [workspaceId]);

  useEffect(() => { fetchWorkspace(); }, [fetchWorkspace]);

  // Reset stale state when workspace changes
  useEffect(() => {
    setData(null);
    setTransferMemberId("");
    setTransferError(null);
    setActionError(null);
  }, [workspaceId]);

  const isAdmin = data?.currentUserRole === "admin";
  const canManage = isAdmin;
  const activeMembers = data?.members.filter((m) => m.status === "active") ?? [];

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setNameLoading(true); setNameError(null); setNameSuccess(false);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) { const p = await res.json().catch(() => ({})); setNameError((p as { message?: string }).message ?? "Failed to update."); return; }
      setNameSuccess(true);
      await fetchWorkspace();
    } catch { setNameError("Failed to update name."); }
    finally { setNameLoading(false); }
  }

  async function handleRemoveMember(memberId: string) {
    setActionLoading(memberId); setActionError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) { const p = await res.json().catch(() => ({})); setActionError((p as { message?: string }).message ?? "Failed to remove."); return; }
      await fetchWorkspace();
    } catch { setActionError("Failed to remove member."); }
    finally { setActionLoading(null); }
  }

  async function handleChangeRole(memberId: string, role: string) {
    setActionLoading(memberId); setActionError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
      });
      if (!res.ok) { const p = await res.json().catch(() => ({})); setActionError((p as { message?: string }).message ?? "Failed to change role."); return; }
      await fetchWorkspace();
    } catch { setActionError("Failed to change role."); }
    finally { setActionLoading(null); }
  }

  async function handleLeave() {
    setConfirmModal({
      title: "Leave workspace",
      message: `Are you sure you want to leave "${data?.name}"? You will lose access to all workspace content.`,
      confirmLabel: "Leave",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading("leave"); setActionError(null);
        try {
          const res = await fetch(`/api/workspaces/${workspaceId}/leave`, { method: "POST" });
          if (!res.ok) { const p = await res.json().catch(() => ({})); setActionError((p as { message?: string }).message ?? "Failed to leave."); return; }
          switchToPersonal();
          await refreshWorkspaces();
          router.refresh();
          router.replace("/dashboard");
        } catch { setActionError("Failed to leave workspace."); }
        finally { setActionLoading(null); }
      }
    });
  }

  async function handleDelete() {
    setConfirmModal({
      title: "Delete workspace",
      message: `Are you sure you want to permanently delete "${data?.name}"? This will remove all meetings, members, and data. This action cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading("delete"); setActionError(null);
        try {
          const res = await fetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
          if (!res.ok) { const p = await res.json().catch(() => ({})); setActionError((p as { message?: string }).message ?? "Failed to delete."); return; }
          switchToPersonal();
          await refreshWorkspaces();
          router.refresh();
          router.replace("/dashboard");
        } catch { setActionError("Failed to delete workspace."); }
        finally { setActionLoading(null); }
      }
    });
  }

  async function handleTransferOwnership(e: React.FormEvent) {
    e.preventDefault();
    if (!transferMemberId) return;
    const target = activeMembers.find((m) => m.id === transferMemberId);
    const targetName = target?.user.fullName ?? target?.user.email ?? "this member";
    setConfirmModal({
      title: "Transfer Admin Rights",
      message: `You are about to transfer admin rights to ${targetName}. They will become the new admin of "${data?.name}", and you will become a regular member. This action cannot be undone.`,
      confirmLabel: "Yes, Transfer",
      danger: false,
      onConfirm: () => {
        setConfirmModal(null);
        confirmTransfer();
      }
    });
  }

  async function confirmTransfer() {
    setTransferLoading(true); setTransferError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/transfer-ownership`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newOwnerMemberId: transferMemberId }),
      });
      if (!res.ok) { const p = await res.json().catch(() => ({})); setTransferError((p as { message?: string }).message ?? "Failed to transfer."); return; }
      setTransferMemberId("");
      router.refresh();
      await fetchWorkspace();
    } catch { setTransferError("Failed to transfer ownership."); }
    finally { setTransferLoading(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-[#6c63ff]" />
    </div>
  );

  if (error) return (
    <Card className="border-red-200 bg-red-50 p-6">
      <p className="text-sm text-red-700">{error}</p>
    </Card>
  );

  if (!data) return null;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Avatar name={data.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 truncate">{data.name}</h1>
            <RoleBadge role={data.currentUserRole} />
          </div>
          <p className="mt-0.5 text-sm text-slate-400">
            {activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""} · Created {new Date(data.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Confirm modal — used for delete, leave, and transfer */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${confirmModal.danger ? "bg-red-100" : "bg-amber-100"}`}>
                {confirmModal.danger
                  ? <Trash2 className="h-5 w-5 text-red-600" />
                  : <Shield className="h-5 w-5 text-amber-600" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{confirmModal.title}</p>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmModal(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={confirmModal.onConfirm}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors ${confirmModal.danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"}`}>
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_450px]">

        {/* Left column */}
        <div className="space-y-6">

          {/* Workspace Name (admin only) */}
          {isAdmin && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-sm font-semibold text-slate-800">Workspace Name</p>
                <p className="text-xs text-slate-400 mt-0.5">Update the display name for this workspace.</p>
              </div>
              <div className="px-5 py-4">
                <form onSubmit={handleUpdateName} className="flex gap-2">
                  <input type="text" value={newName}
                    onChange={(e) => { setNewName(e.target.value); setNameSuccess(false); }}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
                    placeholder="Workspace name" disabled={nameLoading} />
                  <button type="submit" disabled={nameLoading || !newName.trim()}
                    className="inline-flex h-9 items-center rounded-xl bg-[#6c63ff] px-4 text-sm font-semibold text-white hover:bg-[#5b52e0] disabled:opacity-50 transition-colors">
                    {nameLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </button>
                </form>
                {nameError && <p className="mt-2 text-xs text-red-600">{nameError}</p>}
                {nameSuccess && <p className="mt-2 text-xs text-green-600">Name updated successfully.</p>}
              </div>
            </Card>
          )}

          {/* Members */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Members</p>
                <p className="text-xs text-slate-400 mt-0.5">{activeMembers.length} active member{activeMembers.length !== 1 ? "s" : ""}</p>
              </div>
              <Users className="h-4 w-4 text-slate-300" />
            </div>
            <div className="divide-y divide-slate-50">
              {activeMembers.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-slate-400">No members yet.</p>
                </div>
              ) : activeMembers.map((member) => {
                const displayName = member.user.fullName ?? member.user.email ?? member.userId;
                const email = member.user.email;
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={displayName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
                        {email && member.user.fullName && (
                          <p className="truncate text-xs text-slate-400">{email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RoleBadge role={member.role} />
                      {canManage && member.role !== "admin" && (
                        <select value={member.role} onChange={(e) => handleChangeRole(member.id, e.target.value)}
                          disabled={actionLoading === member.id}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40 disabled:opacity-50">
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      )}
                      {canManage && member.role !== "admin" && (
                        <button onClick={() => handleRemoveMember(member.id)} disabled={actionLoading === member.id}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 transition-colors">
                          {actionLoading === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Transfer Admin Rights — only show when there are other members to transfer to */}
          {isAdmin && activeMembers.filter((m) => m.role !== "admin" && m.role !== "owner").length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-sm font-semibold text-slate-800">Transfer Admin Rights</p>
                <p className="text-xs text-slate-400 mt-0.5">Make another member the admin. You will become a regular member.</p>
              </div>
              <div className="px-5 py-4">
                <form onSubmit={handleTransferOwnership} className="flex gap-2">
                  <select value={transferMemberId} onChange={(e) => setTransferMemberId(e.target.value)}
                    disabled={transferLoading}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40 disabled:opacity-50">
                    <option value="">Select a member…</option>
                    {activeMembers
                      .filter((m) => m.role !== "admin" && m.role !== "owner")
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.user.fullName ?? m.user.email ?? m.userId}</option>
                      ))}
                  </select>
                  <button type="submit" disabled={transferLoading || !transferMemberId}
                    className="inline-flex h-9 items-center rounded-xl bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                    {transferLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Transfer"}
                  </button>
                </form>
                {transferError && <p className="mt-2 text-xs text-red-600">{transferError}</p>}
              </div>
            </Card>
          )}

          {/* Danger Zone */}
          <Card className="overflow-hidden border-red-100">
            <div className="border-b border-red-100 bg-red-50/50 px-5 py-4">
              <p className="text-sm font-semibold text-red-700">Danger Zone</p>
              <p className="text-xs text-red-400 mt-0.5">These actions are irreversible. Please be certain.</p>
            </div>
            <div className="divide-y divide-slate-50 px-5">
              {!isAdmin && (
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Leave workspace</p>
                    <p className="text-xs text-slate-400">You will lose access to all workspace content.</p>
                  </div>
                  <button onClick={handleLeave} disabled={actionLoading === "leave"}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                    {actionLoading === "leave" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    Leave
                  </button>
                </div>
              )}
              {isAdmin && (
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Delete workspace</p>
                    <p className="text-xs text-slate-400">Permanently delete this workspace and all its data.</p>
                  </div>
                  <button onClick={handleDelete} disabled={actionLoading === "delete"}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {actionLoading === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete
                  </button>
                </div>
              )}
            </div>
          </Card>

        </div>

        {/* Right column — invite + quick stats */}
        <div className="space-y-6">

          {/* Invite Members */}
          {canManage && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-sm font-semibold text-slate-800">Invite Members</p>
                <p className="text-xs text-slate-400 mt-0.5">Send email invites to add people to this workspace.</p>
              </div>
              <div className="px-5 py-4">
                <InviteMembersCard workspaceId={workspaceId} />
              </div>
            </Card>
          )}

          {/* Quick Stats */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-800">Overview</p>
            </div>
            <div className="divide-y divide-slate-50">
              <div className="flex items-center justify-between px-5 py-3.5">
                <p className="text-sm text-slate-500">Total members</p>
                <p className="text-sm font-semibold text-slate-900">{activeMembers.length}</p>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <p className="text-sm text-slate-500">Admins</p>
                <p className="text-sm font-semibold text-slate-900">
                  {activeMembers.filter((m) => m.role === "admin").length}
                </p>
              </div>              <div className="flex items-center justify-between px-5 py-3.5">
                <p className="text-sm text-slate-500">Your role</p>
                <RoleBadge role={data.currentUserRole} />
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <p className="text-sm text-slate-500">Created</p>
                <p className="text-sm font-semibold text-slate-900">
                  {new Date(data.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorkspacePage() {
  const { activeWorkspaceId } = useWorkspaceContext();

  if (activeWorkspaceId === null) {
    return <WorkspaceListView />;
  }

  return <WorkspaceManagementView workspaceId={activeWorkspaceId} />;
}
