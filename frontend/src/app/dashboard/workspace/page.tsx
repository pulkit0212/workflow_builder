"use client";

import { InviteMembersCard } from "@/components/workspace/InviteMembersCard";
import { PendingMoveRequests } from "@/features/workspaces/components/pending-move-requests";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { Loader2, LogOut } from "lucide-react";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

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
    <span className="inline-flex items-center gap-1 rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[11px] font-semibold text-[#6C3FF5]">
      <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>shield</span> Admin
    </span>
  );
  if (role === "member") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F3F4] px-2 py-0.5 text-[11px] font-semibold text-[#5F6368]">
      <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>person</span> Member
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F3F4] px-2 py-0.5 text-[11px] font-semibold text-[#9AA0A6]">
      <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>visibility</span> Viewer
    </span>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.slice(0, 2).toUpperCase();
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base" };
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6C3FF5] to-[#8b5cf6] font-bold text-white ${sizes[size]}`}>
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Workspace List View
// ---------------------------------------------------------------------------

function WorkspaceListView() {
  const router = useRouter();
  const { switchToWorkspace, refreshWorkspaces, canUseTeamWorkspace } = useWorkspaceContext();
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
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
      const res = await apiFetch("/api/workspaces");
      if (!res.ok) throw new Error("Failed to load workspaces.");
      const raw = await res.json() as WorkspaceListItem[] | { success: boolean; workspaces: WorkspaceListItem[] };
      const data = Array.isArray(raw) ? raw : ((raw as { workspaces?: WorkspaceListItem[] }).workspaces ?? []);
      setWorkspaces(data);
    } catch {
      setError("Failed to load workspaces.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!canUseTeamWorkspace) setShowCreate(false);
  }, [canUseTeamWorkspace]);

  useEffect(() => { if (isAuthReady) fetchWorkspaces(); }, [fetchWorkspaces, isAuthReady]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await apiFetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), members: [] }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setCreateError((payload as { message?: string }).message ?? "Failed to create workspace.");
        return;
      }
      const payload = await res.json() as WorkspaceListItem;
      setNewName("");
      setShowCreate(false);
      await refreshWorkspaces();
      switchToWorkspace(payload.id);
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
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6C3FF5]">WORKSPACE</p>
          <h1 className="mt-1 font-[Work_Sans] text-[22px] font-bold text-[#202124]">Your Workspaces</h1>
          <p className="mt-1 text-[14px] text-[#5F6368]">Collaborate with your team across shared meetings and notes.</p>
        </div>
        {!showCreate && canUseTeamWorkspace && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#6C3FF5] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#5B2FE0] focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/40"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
            New Workspace
          </button>
        )}
        {!showCreate && !canUseTeamWorkspace && (
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 rounded-xl border border-[#DADCE0] bg-white px-4 py-2.5 text-sm font-semibold text-[#5F6368] transition-all hover:bg-[#F8F9FA]"
          >
            <span className="material-symbols-outlined text-[#7C3AED]" style={{ fontSize: "16px" }}>workspace_premium</span>
            Elite: team workspaces
          </Link>
        )}
      </div>

      {/* Create form */}
      {showCreate && canUseTeamWorkspace && (
        <div className="rounded-xl border border-[#EDE9FE] bg-gradient-to-br from-[#faf9ff] to-white p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EDE9FE]">
              <span className="material-symbols-outlined text-[#6C3FF5]" style={{ fontSize: "18px" }}>add</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#202124]">Create a new workspace</p>
              <p className="text-xs text-[#5F6368]">Give your team a shared space for meetings and notes.</p>
            </div>
          </div>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Product Team, Design, Engineering…"
              disabled={creating} autoFocus
              className="flex-1 rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-4 py-2.5 text-sm text-[#202124] placeholder:text-[#9AA0A6] focus:border-[#6C3FF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/20"
            />
            <button type="submit" disabled={creating || !newName.trim()}
              className="inline-flex h-10 items-center rounded-xl bg-[#6C3FF5] px-5 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50 transition-colors">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </button>
            <button type="button" onClick={() => { setShowCreate(false); setNewName(""); setCreateError(null); }}
              className="inline-flex h-10 items-center rounded-xl border border-[#DADCE0] bg-white px-4 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
              Cancel
            </button>
          </form>
          {createError && <p className="mt-2 text-xs text-[#C5221F]">{createError}</p>}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-[#6C3FF5]" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] p-4">
          <p className="text-sm text-[#C5221F]">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && workspaces.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DADCE0] bg-white py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F1F3F4]">
            <span className="material-symbols-outlined text-[#9AA0A6]" style={{ fontSize: "32px" }}>group</span>
          </div>
          <p className="text-base font-semibold text-[#202124]">No workspaces yet</p>
          <p className="mt-1 text-sm text-[#5F6368]">
            {canUseTeamWorkspace
              ? "Create your first workspace to start collaborating."
              : "Team workspaces are included with the Elite plan."}
          </p>
          {canUseTeamWorkspace ? (
            <button onClick={() => setShowCreate(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#6C3FF5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
              Create Workspace
            </button>
          ) : (
            <Link
              href="/dashboard/billing"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#6d28d9] transition-colors"
            >
              View Elite plan
            </Link>
          )}
        </div>
      )}

      {/* Workspace grid */}
      {!loading && workspaces.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((ws) => (
            <button key={ws.id} onClick={() => switchToWorkspace(ws.id)}
              className="group relative flex flex-col rounded-xl border border-[#DADCE0] bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-[#6C3FF5]/50 hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/40">

              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <Avatar name={ws.name} size="md" />
                <RoleBadge role={ws.role} />
              </div>

              {/* Name */}
              <p className="mt-3 truncate text-[15px] font-bold text-[#202124]">{ws.name}</p>

              {/* Stats */}
              <div className="mt-1.5 flex items-center gap-2 text-xs text-[#9AA0A6]">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>group</span>
                  {ws.memberCount} member{ws.memberCount !== 1 ? "s" : ""}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>calendar_month</span>
                  {ws.meetingCount} meeting{ws.meetingCount !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between border-t border-[#DADCE0] pt-3">
                <p className="text-xs text-[#9AA0A6]">
                  {new Date(ws.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
                <span className="text-xs font-semibold text-[#6C3FF5] opacity-0 transition-opacity group-hover:opacity-100">
                  Open →
                </span>
              </div>
            </button>
          ))}

          {/* Add new card */}
          {!showCreate && canUseTeamWorkspace && (
            <button onClick={() => setShowCreate(true)}
              className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-[#DADCE0] bg-[#F8F9FA] p-5 text-center transition-all hover:border-[#6C3FF5]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/40">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F4]">
                <span className="material-symbols-outlined text-[#9AA0A6]" style={{ fontSize: "20px" }}>add</span>
              </div>
              <p className="mt-2.5 text-sm font-semibold text-[#5F6368]">Create New Workspace</p>
              <p className="mt-0.5 text-xs text-[#9AA0A6]">Start a new hub for your next team project.</p>
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
  const { switchToPersonal, refreshWorkspaces, canUseTeamWorkspace } = useWorkspaceContext();
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();

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
    setData(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError((payload as { message?: string }).message ?? "Failed to load workspace.");
        return;
      }
      const payload = await res.json() as WorkspaceData;
      setData(payload);
      setNewName(payload.name);
    } catch {
      setError("Failed to load workspace.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { if (isAuthReady) fetchWorkspace(); }, [fetchWorkspace, isAuthReady]);

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
      const res = await apiFetch(`/api/workspaces/${workspaceId}`, {
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
      const res = await apiFetch(`/api/workspaces/${workspaceId}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) { const p = await res.json().catch(() => ({})); setActionError((p as { message?: string }).message ?? "Failed to remove."); return; }
      await fetchWorkspace();
    } catch { setActionError("Failed to remove member."); }
    finally { setActionLoading(null); }
  }

  async function handleChangeRole(memberId: string, role: string) {
    setActionLoading(memberId); setActionError(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
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
          const res = await apiFetch(`/api/workspaces/${workspaceId}/leave`, { method: "POST" });
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
          const res = await apiFetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
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
      const res = await apiFetch(`/api/workspaces/${workspaceId}/transfer-ownership`, {
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
      <Loader2 className="h-8 w-8 animate-spin text-[#6C3FF5]" />
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] p-6">
      <p className="text-sm text-[#C5221F]">{error}</p>
    </div>
  );

  if (!data) return null;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={data.name} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-[Work_Sans] text-[20px] font-bold text-[#202124] truncate">{data.name}</h1>
              <RoleBadge role={data.currentUserRole} />
            </div>
            <p className="mt-0.5 text-[14px] text-[#5F6368]">
              {activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""} · Created {new Date(data.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {isAdmin ? (
            <button onClick={handleDelete} disabled={actionLoading === "delete"}
              className="inline-flex items-center gap-2 rounded-xl border border-[#FCE8E6] bg-white px-4 py-2.5 text-sm font-semibold text-[#EA4335] transition-colors hover:bg-[#FCE8E6] disabled:opacity-50">
              {actionLoading === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>}
              Delete Workspace
            </button>
          ) : (
            <button onClick={handleLeave} disabled={actionLoading === "leave"}
              className="inline-flex items-center gap-2 rounded-xl border border-[#FCE8E6] bg-white px-4 py-2.5 text-sm font-semibold text-[#EA4335] transition-colors hover:bg-[#FCE8E6] disabled:opacity-50">
              {actionLoading === "leave" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Leave Workspace
            </button>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[#DADCE0] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${confirmModal.danger ? "bg-[#FCE8E6]" : "bg-[#EDE9FE]"}`}>
                {confirmModal.danger
                  ? <span className="material-symbols-outlined text-[#EA4335]" style={{ fontSize: "20px" }}>delete</span>
                  : <span className="material-symbols-outlined text-[#6C3FF5]" style={{ fontSize: "20px" }}>shield</span>}
              </div>
              <div>
                <p className="text-sm font-bold text-[#202124]">{confirmModal.title}</p>
                <p className="mt-1 text-sm text-[#5F6368] leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmModal(null)}
                className="flex-1 rounded-xl border border-[#DADCE0] bg-white py-2.5 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
                Cancel
              </button>
              <button onClick={confirmModal.onConfirm}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors ${confirmModal.danger ? "bg-[#EA4335] hover:bg-[#C5221F]" : "bg-[#6C3FF5] hover:bg-[#5B2FE0]"}`}>
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div className="rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] px-4 py-3">
          <p className="text-sm text-[#C5221F]">{actionError}</p>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">

        {/* LEFT COLUMN */}
        <div className="space-y-6">

          {/* Workspace Identity (admin only) */}
          {isAdmin && (
            <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="border-b border-[#DADCE0] px-5 py-4">
                <p className="text-sm font-semibold text-[#202124]">Workspace Identity</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#9AA0A6]">DISPLAY NAME</p>
              </div>
              <div className="px-5 py-4">
                <form onSubmit={handleUpdateName} className="flex gap-2">
                  <input type="text" value={newName}
                    onChange={(e) => { setNewName(e.target.value); setNameSuccess(false); }}
                    className="flex-1 rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-2 text-sm text-[#202124] focus:border-[#6C3FF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/20"
                    placeholder="Workspace name" disabled={nameLoading} />
                  <button type="submit" disabled={nameLoading || !newName.trim()}
                    className="inline-flex h-9 items-center rounded-xl bg-[#6C3FF5] px-4 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50 transition-colors">
                    {nameLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                  </button>
                </form>
                {nameError && <p className="mt-2 text-xs text-[#C5221F]">{nameError}</p>}
                {nameSuccess && <p className="mt-2 text-xs text-[#137333]">Name updated successfully.</p>}
                <p className="mt-2 text-[12px] italic text-[#9AA0A6]">Only administrators can modify the workspace identity.</p>
              </div>
            </div>
          )}

          {/* Workspace Members */}
          <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#DADCE0] px-5 py-4">
              <p className="text-sm font-semibold text-[#202124]">Workspace Members</p>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9AA0A6]" style={{ fontSize: "16px" }}>search</span>
                <input
                  type="text"
                  placeholder="Search members..."
                  className="rounded-xl border border-[#DADCE0] bg-[#F8F9FA] py-1.5 pl-8 pr-3 text-xs text-[#202124] placeholder:text-[#9AA0A6] focus:border-[#6C3FF5] focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/20"
                  readOnly
                />
              </div>
            </div>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 border-b border-[#DADCE0] px-5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9AA0A6]">MEMBER</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9AA0A6]">EMAIL ADDRESS</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9AA0A6]">ROLE</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9AA0A6]">ACTIONS</p>
            </div>
            <div className="divide-y divide-[#DADCE0]">
              {activeMembers.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-[#9AA0A6]">No members yet.</p>
                </div>
              ) : activeMembers.map((member) => {
                const displayName = member.user.fullName ?? member.user.email ?? member.userId;
                const email = member.user.email;
                return (
                  <div key={member.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-3 px-5 py-3 hover:bg-[#F8F9FA] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={displayName} size="sm" />
                      <p className="truncate text-sm font-medium text-[#202124]">{displayName}</p>
                    </div>
                    <p className="truncate text-sm text-[#5F6368]">{email ?? "—"}</p>
                    <div className="flex items-center gap-2">
                      <RoleBadge role={member.role} />
                      {canManage && member.role !== "admin" && (
                        <select value={member.role} onChange={(e) => handleChangeRole(member.id, e.target.value)}
                          disabled={actionLoading === member.id}
                          className="rounded-lg border border-[#DADCE0] bg-white px-2 py-1 text-xs text-[#5F6368] focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/20 disabled:opacity-50">
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      )}
                    </div>
                    <div className="flex items-center justify-end">
                      {canManage && member.role !== "admin" && (
                        <button onClick={() => handleRemoveMember(member.id)} disabled={actionLoading === member.id}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#9AA0A6] hover:bg-[#FCE8E6] hover:text-[#EA4335] disabled:opacity-50 transition-colors">
                          {actionLoading === member.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>person_remove</span>}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom two-column grid (admin only) */}
          {isAdmin && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

              {/* Move Requests */}
              <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between border-b border-[#DADCE0] px-5 py-4">
                  <p className="text-sm font-semibold text-[#202124]">Move Requests</p>
                  <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[11px] font-semibold text-[#6C3FF5]">
                    {(data.joinRequests ?? []).length} Pending
                  </span>
                </div>
                <div className="px-5 py-4">
                  <PendingMoveRequests workspaceId={workspaceId} />
                </div>
              </div>

              {/* Transfer Ownership */}
              {activeMembers.filter((m) => m.role !== "admin" && m.role !== "owner").length > 0 && (
                <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <div className="border-b border-[#DADCE0] px-5 py-4">
                    <p className="text-sm font-semibold text-[#202124]">Transfer Ownership</p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="mb-3 text-xs text-[#5F6368]">Make another member the admin. You will become a regular member.</p>
                    <form onSubmit={handleTransferOwnership} className="flex flex-col gap-3">
                      <select value={transferMemberId} onChange={(e) => setTransferMemberId(e.target.value)}
                        disabled={transferLoading}
                        className="w-full rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-2 text-sm text-[#202124] focus:border-[#6C3FF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/20 disabled:opacity-50">
                        <option value="">Select a member…</option>
                        {activeMembers
                          .filter((m) => m.role !== "admin" && m.role !== "owner")
                          .map((m) => (
                            <option key={m.id} value={m.id}>{m.user.fullName ?? m.user.email ?? m.userId}</option>
                          ))}
                      </select>
                      <button type="submit" disabled={transferLoading || !transferMemberId}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6C3FF5] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50 transition-colors">
                        {transferLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>shield</span> Transfer Admin Rights</>}
                      </button>
                    </form>
                    {transferError && <p className="mt-2 text-xs text-[#C5221F]">{transferError}</p>}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* RIGHT COLUMN (sidebar) */}
        <div className="space-y-6">

          {/* Invite Members card — Elite only (server-enforced) */}
          {canManage && canUseTeamWorkspace && (
            <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="bg-gradient-to-br from-[#6C3FF5] to-[#5B2FE0] px-5 py-4">
                <p className="font-bold text-white">Invite Members</p>
                <p className="mt-1 text-sm text-white/80">Grow your workspace and collaborate with team members across departments.</p>
              </div>
              <div className="px-5 py-4">
                <InviteMembersCard workspaceId={workspaceId} />
              </div>
            </div>
          )}
          {canManage && !canUseTeamWorkspace && (
            <div className="rounded-xl border border-[#DADCE0] bg-[#F8F9FA] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <p className="text-sm font-semibold text-[#202124]">Invite members</p>
              <p className="mt-1 text-xs text-[#5F6368]">Sending invites requires an Elite plan so everyone on the team can use shared workspaces.</p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-xs font-semibold text-white hover:bg-[#6d28d9]"
              >
                Upgrade to Elite
              </Link>
            </div>
          )}

          {/* Workspace Health */}
          <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="border-b border-[#DADCE0] px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9AA0A6]">WORKSPACE HEALTH</p>
            </div>
            <div className="divide-y divide-[#DADCE0]">
              {/* Total Members */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#5F6368]">Total Members</p>
                  <p className="text-sm font-semibold text-[#202124]">{activeMembers.length}</p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F3F4]">
                  <div
                    className="h-full rounded-full bg-[#6C3FF5] transition-all"
                    style={{ width: `${Math.min(100, (activeMembers.length / 10) * 100)}%` }}
                  />
                </div>
              </div>
              {/* Your Role */}
              <div className="flex items-center justify-between px-5 py-4">
                <p className="text-sm text-[#5F6368]">Your Role</p>
                <RoleBadge role={data.currentUserRole} />
              </div>
              {/* Created */}
              <div className="flex items-center justify-between px-5 py-4">
                <p className="text-sm text-[#5F6368]">Created</p>
                <p className="text-sm font-semibold text-[#202124]">
                  {new Date(data.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>

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
