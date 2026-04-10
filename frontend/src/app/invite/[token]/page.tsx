"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useUser, useClerk } from "@clerk/nextjs";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

type ValidateResult = {
  workspaceId: string;
  workspaceName: string;
  invitedEmail: string;
  inviterName: string;
};

type PageState =
  | { type: "loading" }
  | { type: "error"; reason: string }
  | { type: "mismatch"; invitedEmail: string; currentEmail: string; workspaceId: string }
  | { type: "success" };

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const token = typeof params.token === "string" ? params.token : "";

  const [state, setState] = useState<PageState>({ type: "loading" });

  useEffect(() => {
    if (!isLoaded) return;
    if (!token) {
      setState({ type: "error", reason: "Invalid invite link." });
      return;
    }

    async function handleInvite() {
      // Step 1: Validate token
      const validateRes = await fetch(`/api/invite/validate?token=${encodeURIComponent(token)}`);
      if (!validateRes.ok) {
        const data = await validateRes.json().catch(() => ({})) as { details?: { code?: string } };
        const code = data?.details?.code;
        const reasons: Record<string, string> = {
          token_not_found: "This invite link is invalid or does not exist.",
          token_expired: "This invite link has expired.",
          token_already_used: "This invite has already been accepted.",
          token_revoked: "This invite has been revoked."
        };
        setState({ type: "error", reason: reasons[code ?? ""] ?? "This invite link is not valid." });
        return;
      }

      const validateData = await validateRes.json() as ValidateResult;

      // Step 2: Check auth
      if (!isSignedIn) {
        // Redirect to sign-in with redirect back to this page
        const redirectUrl = encodeURIComponent(`/invite/${token}`);
        router.push(`/sign-in?redirect_url=${redirectUrl}`);
        return;
      }

      // Step 3: Accept invite
      const acceptRes = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });

      if (acceptRes.ok) {
        const acceptData = await acceptRes.json() as { workspaceId: string };
        setState({ type: "success" });
        router.push(`/dashboard?workspace=${acceptData.workspaceId}`);
        return;
      }

      const acceptData = await acceptRes.json().catch(() => ({})) as { details?: { code?: string } };
      const code = acceptData?.details?.code;

      if (acceptRes.status === 403 && code === "email_mismatch") {
        const currentEmail = user?.primaryEmailAddress?.emailAddress ?? "";
        setState({
          type: "mismatch",
          invitedEmail: validateData.invitedEmail,
          currentEmail,
          workspaceId: validateData.workspaceId
        });
        return;
      }

      setState({ type: "error", reason: "Failed to accept the invite. Please try again." });
    }

    handleInvite().catch(() => {
      setState({ type: "error", reason: "Something went wrong. Please try again." });
    });
  }, [isLoaded, isSignedIn, token, router, user]);

  if (state.type === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-[#6c63ff]" />
          <p className="text-sm">Processing your invite...</p>
        </div>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-semibold text-slate-900">Invite Not Valid</h1>
          <p className="text-sm text-slate-500">{state.reason}</p>
          <a
            href="/dashboard"
            className="inline-block mt-2 rounded-xl bg-[#6c63ff] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#5b52e0] transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (state.type === "mismatch") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full space-y-4">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-semibold text-slate-900 text-center">Wrong Account</h1>
          <p className="text-sm text-slate-600 text-center">
            This invite was sent to{" "}
            <span className="font-semibold text-slate-900">{state.invitedEmail}</span>, but you are
            logged in as{" "}
            <span className="font-semibold text-slate-900">{state.currentEmail}</span>.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={async () => {
                await signOut();
                const redirectUrl = encodeURIComponent(`/invite/${token}`);
                router.push(`/sign-in?redirect_url=${redirectUrl}`);
              }}
              className="w-full rounded-xl bg-[#6c63ff] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#5b52e0] transition-colors"
            >
              Switch Account
            </button>
            <a
              href="/dashboard"
              className="w-full rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-center"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  // success — router.push already called, show brief success state
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <CheckCircle className="h-8 w-8 text-green-500" />
        <p className="text-sm">Joining workspace...</p>
      </div>
    </div>
  );
}
