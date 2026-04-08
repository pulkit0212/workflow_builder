"use client";

import { useEffect, useState, useTransition } from "react";
import { BriefcaseBusiness, LoaderCircle, Plus, ShieldCheck, Trash2, Users, Video } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  addWorkspaceMember,
  fetchWorkspaceJoinRequests,
  createWorkspaceMeeting,
  fetchWorkspaceDetails,
  fetchWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMember
} from "@/features/workspaces/api";
import type {
  WorkspaceDetails,
  WorkspaceJoinRequestRecord,
  WorkspaceMeetingRecord,
  WorkspaceMemberRecord,
  WorkspaceRole
} from "@/features/workspaces/types";
import {
  WorkspaceJoinRequestsPanel
} from "@/components/workspace/WorkspaceJoinRequestsPanel";
import {
  WorkspaceMemberPicker,
  type SelectedWorkspaceMember
} from "@/components/workspace/WorkspaceMemberPicker";

type WorkspaceDashboardProps = {
  workspaceId: string;
};

type WorkspaceTab = "meetings" | "members";

function formatMeetingDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function WorkspaceDashboard({ workspaceId }: WorkspaceDashboardProps) {
  const [workspace, setWorkspace] = useState<WorkspaceDetails | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [joinRequests, setJoinRequests] = useState<WorkspaceJoinRequestRecord[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("meetings");
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMembers, setNewMembers] = useState<SelectedWorkspaceMember[]>([]);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  async function loadWorkspace() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [workspaceDetails, workspaceMembers, requests] = await Promise.all([
        fetchWorkspaceDetails(workspaceId),
        fetchWorkspaceMembers(workspaceId),
        fetchWorkspaceJoinRequests(workspaceId).catch(() => [])
      ]);

      setWorkspace(workspaceDetails);
      setMembers(workspaceMembers);
      setJoinRequests(requests);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load workspace.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [workspaceId]);

  function handleStartMeeting() {
    startTransition(async () => {
      try {
        const meeting = await createWorkspaceMeeting(workspaceId, {
          title: newMeetingTitle
        });
        setWorkspace((current) =>
          current
            ? {
                ...current,
                meetings: [meeting, ...current.meetings]
              }
            : current
        );
        setNewMeetingTitle("");
        setMeetingError(null);
      } catch (error) {
        setMeetingError(
          error instanceof Error ? error.message : "Failed to create workspace meeting."
        );
      }
    });
  }

  function handleAddMembers() {
    startTransition(async () => {
      try {
        const addedMembers = await Promise.all(
          newMembers.map((member) =>
            addWorkspaceMember(workspaceId, {
              userId: member.userId,
              role: member.role
            })
          )
        );
        setMembers((current) => {
          const existingByUserId = new Map(current.map((member) => [member.userId, member]));

          for (const member of addedMembers) {
            existingByUserId.set(member.userId, member);
          }

          return Array.from(existingByUserId.values());
        });
        setNewMembers([]);
        setMemberError(null);
      } catch (error) {
        setMemberError(error instanceof Error ? error.message : "Failed to add members.");
      }
    });
  }

  function handleChangeRole(memberId: string, role: WorkspaceRole) {
    startTransition(async () => {
      try {
        const updatedMember = await updateWorkspaceMember(workspaceId, memberId, {
          role
        });
        setMembers((current) =>
          current.map((member) =>
            member.id === memberId
              ? {
                  ...member,
                  role: updatedMember.role,
                  status: updatedMember.status
                }
              : member
          )
        );
        setMemberError(null);
      } catch (error) {
        setMemberError(error instanceof Error ? error.message : "Failed to update member.");
      }
    });
  }

  function handleRemoveMember(memberId: string) {
    startTransition(async () => {
      try {
        await removeWorkspaceMember(workspaceId, memberId);
        setMembers((current) => current.filter((member) => member.id !== memberId));
        setMemberError(null);
      } catch (error) {
        setMemberError(error instanceof Error ? error.message : "Failed to remove member.");
      }
    });
  }

  if (isLoading) {
    return (
      <Card className="flex min-h-72 items-center justify-center p-8 text-[#6b7280]">
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </Card>
    );
  }

  if (loadError || !workspace) {
    return (
      <Card className="border-[#fecaca] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">Unable to load workspace</h2>
            <p className="mt-2 text-sm text-[#6b7280]">{loadError ?? "Workspace not found."}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadWorkspace()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const meetings = workspace.meetings;
  const canManageMembers =
    workspace.currentUserRole === "owner" || workspace.currentUserRole === "admin";

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace Dashboard"
        title={workspace.name}
        description="Browse workspace meetings, manage visibility through shared membership, and start new team sessions without changing personal meeting behavior."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <Card className="overflow-hidden p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6c63ff]">
                  Workspace Overview
                </p>
                <h2 className="text-2xl font-semibold text-[#111827]">{workspace.name}</h2>
                <p className="text-sm text-[#6b7280]">Workspace ID: {workspace.id}</p>
              </div>
              <div className="inline-flex rounded-full bg-[#eef2ff] px-4 py-2 text-sm font-semibold text-[#5b52ee]">
                {workspace.currentUserRole}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.6rem] border border-[#e5e7eb] bg-[#f9fafb] p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-[#6b7280]">
                  <Users className="h-4 w-4 text-[#6c63ff]" />
                  Members
                </div>
                <p className="mt-2 text-3xl font-semibold text-[#111827]">{members.length}</p>
              </div>
              <div className="rounded-[1.6rem] border border-[#e5e7eb] bg-[#f9fafb] p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-[#6b7280]">
                  <Video className="h-4 w-4 text-[#2563eb]" />
                  Meetings
                </div>
                <p className="mt-2 text-3xl font-semibold text-[#111827]">{meetings.length}</p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-[#eef2f7] px-6 py-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant={activeTab === "meetings" ? "default" : "outline"}
                  onClick={() => setActiveTab("meetings")}
                >
                  Meetings
                </Button>
                <Button
                  type="button"
                  variant={activeTab === "members" ? "default" : "outline"}
                  onClick={() => setActiveTab("members")}
                >
                  Members
                </Button>
              </div>
            </div>

            {activeTab === "meetings" ? (
              <div className="space-y-6 p-6">
                <div className="rounded-[1.8rem] border border-[#dbeafe] bg-[#f8fbff] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563eb]">
                        Workspace Meetings
                      </p>
                      <h3 className="text-xl font-semibold text-[#111827]">Start a workspace meeting</h3>
                      <p className="text-sm text-[#6b7280]">
                        Create a team-visible meeting record inside this workspace.
                      </p>
                    </div>
                    <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
                      <input
                        value={newMeetingTitle}
                        onChange={(event) => {
                          setNewMeetingTitle(event.target.value);
                          if (meetingError) {
                            setMeetingError(null);
                          }
                        }}
                        placeholder="Product Planning"
                        className="min-w-0 flex-1 rounded-xl border border-[#d1d5db] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#2563eb]"
                      />
                      <Button
                        type="button"
                        onClick={handleStartMeeting}
                        disabled={isPending || newMeetingTitle.trim().length < 2}
                      >
                        {isPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        Start Meeting
                      </Button>
                    </div>
                  </div>
                  {meetingError ? (
                    <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#991b1b]">
                      {meetingError}
                    </div>
                  ) : null}
                </div>

                {meetings.length > 0 ? (
                  <div className="space-y-4">
                    {meetings.map((meeting: WorkspaceMeetingRecord) => (
                      <div
                        key={meeting.id}
                        className="rounded-[1.6rem] border border-[#e5e7eb] bg-white p-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-[#111827]">{meeting.title}</h3>
                            <p className="mt-1 text-sm text-[#6b7280]">
                              {formatMeetingDate(meeting.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#5b52ee]">
                              {meeting.status}
                            </span>
                            <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">
                              {meeting.platform}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Video}
                    title="No workspace meetings yet"
                    description="Start the first workspace meeting to create a shared record for your team."
                  />
                )}
              </div>
            ) : (
              <div className="space-y-4 p-6">
                {canManageMembers ? (
                  <div className="rounded-[1.8rem] border border-[#dbeafe] bg-[#f8fbff] p-5">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563eb]">
                          Add Members
                        </p>
                        <h3 className="text-xl font-semibold text-[#111827]">Invite teammates</h3>
                      </div>
                      <WorkspaceMemberPicker
                        label="Search users"
                        selectedMembers={newMembers}
                        onChange={setNewMembers}
                        actionLabel="Add"
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={handleAddMembers}
                          disabled={isPending || newMembers.length === 0}
                        >
                          {isPending ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Add Members
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {canManageMembers ? (
                  <WorkspaceJoinRequestsPanel
                    workspaceId={workspaceId}
                    requests={joinRequests}
                    onAccepted={(requestId) => {
                      setJoinRequests((current) =>
                        current.filter((request) => request.id !== requestId)
                      );
                      void loadWorkspace();
                    }}
                    onRejected={(requestId) => {
                      setJoinRequests((current) =>
                        current.filter((request) => request.id !== requestId)
                      );
                    }}
                  />
                ) : null}

                {members.length > 0 ? (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col gap-3 rounded-[1.6rem] border border-[#e5e7eb] bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-[#111827]">
                          {member.user?.fullName || member.user?.email || "Workspace member"}
                        </p>
                        <p className="text-sm text-[#6b7280]">{member.user?.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-[#f9fafb] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {member.status}
                        </span>
                        {canManageMembers && member.role !== "owner" ? (
                          <select
                            value={member.role}
                            onChange={(event) =>
                              handleChangeRole(member.id, event.target.value as WorkspaceRole)
                            }
                            className="rounded-xl border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#111827] outline-none"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <div className="inline-flex rounded-full bg-[#f9fafb] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                            {member.role}
                          </div>
                        )}
                        {canManageMembers && member.role !== "owner" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    icon={Users}
                    title="No members found"
                    description="Members will appear here once the workspace starts growing."
                  />
                )}
                {memberError ? (
                  <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#991b1b]">
                    {memberError}
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-[#111827]">Workspace sharing</p>
                <p className="mt-1 text-sm text-[#6b7280]">
                  Share this workspace ID with teammates so they can join from the Workspaces page.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-dashed border-[#c7d2fe] bg-[#f8faff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6c63ff]">Workspace ID</p>
                <p className="mt-2 break-all text-sm text-[#111827]">{workspace.id}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
                <BriefcaseBusiness className="h-4 w-4 text-[#6c63ff]" />
                Collaboration rules
              </div>
              <div className="space-y-2 text-sm leading-6 text-[#6b7280]">
                <p>Personal meetings continue to live outside workspaces and remain unchanged.</p>
                <p>Workspace meetings are visible to members of this workspace.</p>
                <p>Downstream AI and recording flows remain untouched by this navigation layer.</p>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
