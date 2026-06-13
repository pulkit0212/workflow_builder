"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EliteFeatureKey =
  | "export_share_download"
  | "action_items_manage"
  | "team_workspace"
  | "generic";

const FEATURE_COPY: Record<EliteFeatureKey, { title: string; description: string }> = {
  export_share_download: {
    title: "Export & share on Elite",
    description:
      "Download PDFs, export CSV, and share to Slack, Jira, Gmail, and Notion with Elite.",
  },
  action_items_manage: {
    title: "Edit tasks on Elite",
    description:
      "Create, update, and delete action items across your backlog with Elite.",
  },
  team_workspace: {
    title: "Team workspaces on Elite",
    description:
      "Collaborate with your team, share meetings, and manage workspace tasks with Elite.",
  },
  generic: {
    title: "Available on Elite",
    description:
      "Upgrade to Elite for unlimited meetings, full edit/export/share, and team workspaces.",
  },
};

type EliteRequiredDialogProps = {
  open: boolean;
  onClose: () => void;
  feature?: EliteFeatureKey;
};

export function EliteRequiredDialog({
  open,
  onClose,
  feature = "generic",
}: EliteRequiredDialogProps) {
  if (!open) return null;

  const copy = FEATURE_COPY[feature];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EDE9FE]">
            <Sparkles className="h-5 w-5 text-[#6C3FF5]" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#9AA0A6] hover:bg-[#F1F3F4] hover:text-[#5F6368]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-[#6C3FF5]">
          Elite feature
        </p>
        <h2 className="mt-1 text-lg font-bold text-[#202124]">{copy.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#5F6368]">{copy.description}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/dashboard/billing">
              Upgrade to Elite <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA]"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
