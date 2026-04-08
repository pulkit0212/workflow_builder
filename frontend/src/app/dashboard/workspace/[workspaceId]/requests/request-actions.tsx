"use client";

import { useState, useTransition } from "react";
import { CheckCircle, LoaderCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

type ToastState = { message: string; type: "success" | "error" } | null;

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 cursor-pointer rounded-xl border px-4 py-3 text-sm shadow-lg ${
        toast.type === "success"
          ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
          : "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
      }`}
      onClick={onDismiss}
    >
      {toast.message}
    </div>
  );
}

export function RequestActions({
  requestId,
  workspaceId,
}: {
  requestId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(t: ToastState) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  async function handleAction(action: "approve" | "reject") {
    startTransition(async () => {
      try {
        const body: { action: string; adminNote?: string } = { action };
        if (action === "reject" && adminNote.trim()) {
          body.adminNote = adminNote.trim();
        }

        const res = await fetch(
          `/api/workspace/${workspaceId}/move-requests/${requestId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        const data = (await res.json()) as { success: boolean; message?: string };

        if (res.ok && data.success) {
          showToast({
            message: action === "approve" ? "Request approved." : "Request rejected.",
            type: "success",
          });
          setShowRejectForm(false);
          setAdminNote("");
          router.refresh();
        } else {
          showToast({
            message: data.message ?? `Failed to ${action} request.`,
            type: "error",
          });
        }
      } catch {
        showToast({ message: `Failed to ${action} request.`, type: "error" });
      }
    });
  }

  if (showRejectForm) {
    return (
      <>
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-xs font-medium text-slate-600">
            Admin note (optional)
          </label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Reason for rejection..."
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="danger"
              onClick={() => handleAction("reject")}
              disabled={isPending}
            >
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Confirm Reject
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowRejectForm(false);
                setAdminNote("");
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          variant="default"
          onClick={() => handleAction("approve")}
          disabled={isPending}
        >
          {isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          Approve
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => setShowRejectForm(true)}
          disabled={isPending}
        >
          <XCircle className="h-4 w-4" />
          Reject
        </Button>
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
