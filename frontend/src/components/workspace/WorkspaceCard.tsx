import Link from "next/link";
import { ArrowRight, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { WorkspaceRecord } from "@/features/workspaces/types";

type WorkspaceCardProps = {
  workspace: WorkspaceRecord;
};

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <Card className="overflow-hidden border-[#e8eafc] bg-gradient-to-br from-white via-white to-[#f7f7ff] p-6">
      <div className="flex flex-col gap-5">
        <div className="space-y-2">
          <div className="inline-flex rounded-full bg-[#eef2ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5b52ee]">
            {workspace.role}
          </div>
          <h3 className="text-xl font-semibold text-[#111827]">{workspace.name}</h3>
          <p className="text-sm text-[#6b7280]">
            Shared meeting intelligence for your team without changing personal meeting ownership.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#e5e7eb] bg-white/90 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#6b7280]">
              <Users className="h-4 w-4 text-[#6c63ff]" />
              Members
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#111827]">{workspace.memberCount}</p>
          </div>
          <div className="rounded-2xl border border-[#e5e7eb] bg-white/90 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#6b7280]">
              <Video className="h-4 w-4 text-[#2563eb]" />
              Meetings
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#111827]">{workspace.meetingCount}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">
            Created {new Date(workspace.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          <Button asChild>
            <Link href={`/dashboard/workspaces/${workspace.id}`}>
              Open
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
