"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardCopy, Loader2, Mail, Trash2 } from "lucide-react";
import { clientApiFetch } from "@/lib/api-client";

type PendingInvite = {
  id: string;
  invitedEmail: string;
  createdAt: string;
  expiresAt: string;
};

interface InviteMembersCardProps {
  workspaceId: string;
}

export function InviteMembersCard({ workspaceId }: InviteMembersCardProps) {
  const [email, setEmail] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [invitesLoadError, setInvitesLoadError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetchPendingInvites();
  }, [workspaceId]);

  async function fetchPendingInvites() {
    setLoadingInvites(true);
    setInvitesLoadError(null);
    try {
      const res = await clientApiFetch(`/api/workspaces/${workspaceId}/invite`);
      if (res.ok) {
        const data = (await res.json()) as { invites?: PendingInvite[] };
        setPendingInvites(data.invites ?? []);
      } else {
        setPendingInvites([]);
        setInvitesLoadError("Could not load pending invites.");
      }
    } catch {
      setPendingInvites([]);
      setInvitesLoadError("Could not load pending invites.");
    } finally {
      setLoadingInvites(false);
    }
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setMessage(null);
    setLastInviteLink(null);
    setCopyDone(false);
    setShowSuggestions(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await clientApiFetch(
            `/api/workspaces/${workspaceId}/invite/suggestions?q=${encodeURIComponent(value)}`
          );
          if (res.ok) {
            const data = (await res.json()) as { suggestions?: string[] };
            const list = data.suggestions ?? [];
            setSuggestions(list);
            setShowSuggestions(list.length > 0);
          }
        } catch {
          // ignore suggestion errors
        }
      })();
    }, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setMessage(null);
    setLastInviteLink(null);
    setCopyDone(false);

    try {
      const res = await clientApiFetch(`/api/workspaces/${workspaceId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        inviteLink?: string;
        emailSent?: boolean;
        emailSkippedReason?: "not_configured" | "send_failed";
        emailError?: string;
        details?: { code?: string };
      };

      if (res.status === 201 && data.success && data.inviteLink) {
        let successText: string;
        if (data.emailSent) {
          successText =
            "We emailed an invite link to that address. You can still copy the link below if needed.";
        } else if (data.emailSkippedReason === "send_failed") {
          successText = data.emailError
            ? `Invite saved, but email failed: ${data.emailError} Copy the link below to share manually.`
            : "Invite saved, but email could not be sent. Copy the link below — on Resend free tier you may need a verified domain or send only to allowed test addresses.";
        } else {
          successText =
            "Invite link created. Copy it below — set RESEND_API_KEY in backend/express-api/.env and restart the API for automatic email.";
        }
        setMessage({ type: "success", text: successText });
        setLastInviteLink(data.inviteLink);
        setEmail("");
        setSuggestions([]);
        await fetchPendingInvites();
        return;
      }

      const code = data?.details?.code;

      if (code === "invite_already_pending") {
        setMessage({ type: "error", text: "An invite is already pending for this email." });
      } else if (code === "already_a_member") {
        setMessage({ type: "error", text: "This user is already a member of the workspace." });
      } else if (code === "invalid_email") {
        setMessage({ type: "error", text: "Please enter a valid email address." });
      } else {
        setMessage({ type: "error", text: "Failed to send invite. Please try again." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to send invite. Please try again." });
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    setRevoking(inviteId);
    try {
      const res = await clientApiFetch(`/api/workspaces/${workspaceId}/invite/${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPendingInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      }
    } finally {
      setRevoking(null);
    }
  }

  async function copyInviteLink() {
    if (!lastInviteLink) return;
    try {
      await navigator.clipboard.writeText(lastInviteLink);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setMessage({ type: "error", text: "Could not copy to clipboard." });
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <form onSubmit={handleSubmit} className="relative flex gap-2">
          <div className="relative flex-1">
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Enter email address"
              disabled={sending}
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/40"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onMouseDown={() => {
                        setEmail(s);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="submit"
            disabled={sending || !email.trim()}
            className="inline-flex h-9 items-center rounded-xl bg-[#6C3FF5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#5b52e0] disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
          </button>
        </form>
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
        {lastInviteLink && (
          <div className="flex flex-col gap-2 rounded-xl border border-[#EDE9FE] bg-[#F8F5FF] px-3 py-2.5">
            <p className="text-xs font-medium text-[#5F6368]">Invite link</p>
            <p className="break-all text-xs text-[#202124]">{lastInviteLink}</p>
            <button
              type="button"
              onClick={() => void copyInviteLink()}
              className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-[#6C3FF5]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#6C3FF5] hover:bg-[#EDE9FE]/50"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copyDone ? "Copied!" : "Copy link"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pending Invites</h4>
        {loadingInvites ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : invitesLoadError ? (
          <p className="text-sm text-red-600 py-2">{invitesLoadError}</p>
        ) : pendingInvites.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No pending invites.</p>
        ) : (
          <ul className="space-y-2">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{invite.invitedEmail}</p>
                  <p className="text-xs text-slate-400">
                    Sent {formatDate(invite.createdAt)} · Expires {formatDate(invite.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevoke(invite.id)}
                  disabled={revoking === invite.id}
                  className="ml-3 flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  title="Revoke invite"
                >
                  {revoking === invite.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
