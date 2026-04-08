"use client";

import { useEffect, useState } from "react";
import { BriefcaseBusiness, DoorOpen, LoaderCircle, Plus } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateWorkspaceModal } from "@/components/workspace/CreateWorkspaceModal";
import { JoinWorkspaceModal } from "@/components/workspace/JoinWorkspaceModal";
import { WorkspaceCard } from "@/components/workspace/WorkspaceCard";
import { fetchWorkspaces } from "@/features/workspaces/api";
import type { WorkspaceRecord } from "@/features/workspaces/types";

export function WorkspaceList() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);

  async function loadWorkspaces() {
    setIsLoading(true);
    setError(null);

    try {
      setWorkspaces(await fetchWorkspaces());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load workspaces.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  return (
    <>
      <div className="space-y-8">
        <SectionHeader
          eyebrow="Workspaces"
          title="Team collaboration spaces"
          description="Create shared spaces for workspace meetings, member visibility, and team-level meeting history while personal meetings continue to work exactly the same."
          action={
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => setIsJoinOpen(true)}>
                <DoorOpen className="h-4 w-4" />
                Join Workspace
              </Button>
              <Button type="button" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Workspace
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <Card className="flex min-h-72 items-center justify-center p-8 text-[#6b7280]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </Card>
        ) : notice ? (
          <>
            <Card className="border-[#bfdbfe] bg-[#eff6ff] p-4">
              <p className="text-sm text-[#1d4ed8]">{notice}</p>
            </Card>
            {workspaces.length > 0 ? (
              <div className="grid gap-6 xl:grid-cols-2">
                {workspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BriefcaseBusiness}
                title="Join request submitted"
                description="Your request is pending admin approval. Existing active workspaces will appear here."
              />
            )}
          </>
        ) : error ? (
          <Card className="border-[#fecaca] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#111827]">Unable to load workspaces</h2>
                <p className="mt-2 text-sm text-[#6b7280]">{error}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void loadWorkspaces()}>
                Retry
              </Button>
            </div>
          </Card>
        ) : workspaces.length === 0 ? (
          <div className="space-y-6">
            <EmptyState
              icon={BriefcaseBusiness}
              title="No workspaces yet"
              description="Create your first workspace or join an existing one to unlock shared meetings and team collaboration."
            />
            <div className="flex flex-wrap justify-center gap-3">
              <Button type="button" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Workspace
              </Button>
              <Button type="button" variant="secondary" onClick={() => setIsJoinOpen(true)}>
                <DoorOpen className="h-4 w-4" />
                Join Workspace
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {workspaces.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} />
            ))}
          </div>
        )}
      </div>

      <CreateWorkspaceModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(workspace) => {
          setWorkspaces((current) => [workspace, ...current]);
        }}
      />
      <JoinWorkspaceModal
        open={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
        onJoined={(workspace) => {
          setNotice(`Join request sent for ${workspace.name}. An admin will review it shortly.`);
        }}
      />
    </>
  );
}
