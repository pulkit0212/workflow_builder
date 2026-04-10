"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mail, Trash2, UserPlus } from "lucide-react";

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
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load pending invites on mount
  useEffect(() => {
    fetchPendingInvites();
  }, [workspaceId]);

  async function fetchPendingInvites() {
    setLoadingInvites(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/invite`);
      if (res.ok) {
        const data = await res.json() as { invites: PendingInvite[] };
        setPendingInvites(data.invites ?? []);
      }
    } finally {
      setLoadingInvites(false);
    }
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setMessage(null);
    setShowSuggestions(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/workspace/${workspaceId}/invite/suggestions?q=${encodeURIComponent(value)}`
        );
        if (res.ok) {
          const data = await res.json() as { suggestions: string[] };
          setSuggestions(data.suggestions ?? []);
          setShowSuggestions((data.suggestions ?? []).length > 0);
        }
      } catch {
        // ignore suggestion errors
      }
    }, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/workspace/${workspaceId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });

      if (res.status === 201) {
        setMessage({ type: "success", text: "Invite sent!" });
        setEmail("");
        setSuggestions([]);
        await fetchPendingInvites();
        return;
      }

      const data = await res.json().catch(() => ({})) as { details?: { code?: string } };
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
      const res = await fetch(`/api/workspace/${workspaceId}/invite/${inviteId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setPendingInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      }
    } finally {
      setRevoking(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[#6c63ff]" />
          Invite Members
        </h3>
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
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
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
            className="inline-flex h-9 items-center rounded-xl bg-[#6c63ff] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#5b52e0] disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
          </button>
        </form>
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Pending invites list */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pending Invites</h4>
        {loadingInvites ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
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
                  onClick={() => handleRevoke(invite.id)}
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
