"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { Loader2, Users } from "lucide-react";
import { clientApiFetch } from "@/lib/api-client";

function InviteAcceptInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const { isLoaded, isSignedIn } = useAuth();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectBack = token ? `/invite?token=${encodeURIComponent(token)}` : "/invite";

  async function acceptInvite() {
    if (!token) return;
    setJoining(true);
    setError(null);
    try {
      const res = await clientApiFetch("/api/workspaces/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not accept this invite.");
        return;
      }
      router.push("/dashboard/workspace");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setJoining(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[#DADCE0] bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-[#202124]">Invalid invite</h1>
        <p className="mt-2 text-sm text-[#5F6368]">This link is missing a token. Ask your admin for a new invite link.</p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm font-semibold text-[#6C3FF5] hover:text-[#5B2FE0]">
          Go to dashboard
        </Link>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#5F6368]">
        <Loader2 className="h-8 w-8 animate-spin text-[#6C3FF5]" />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[#DADCE0] bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDE9FE] text-[#6C3FF5]">
          <Users className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-[#202124]">You&apos;re invited to a workspace</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5F6368]">
          Sign in or create an account with the <strong>same email address</strong> the invite was sent to. Then you can
          join the team workspace.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <SignInButton mode="modal" forceRedirectUrl={redirectBack}>
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#6C3FF5] px-4 py-3 text-sm font-semibold text-white hover:bg-[#5B2FE0]"
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal" forceRedirectUrl={redirectBack}>
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#DADCE0] bg-white px-4 py-3 text-sm font-semibold text-[#202124] hover:bg-[#F8F9FA]"
            >
              Sign up
            </button>
          </SignUpButton>
        </div>
        <p className="mt-6 text-xs text-[#9AA0A6]">
          After signing in you&apos;ll return here to accept the invite.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[#DADCE0] bg-white p-8 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDE9FE] text-[#6C3FF5]">
        <Users className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-xl font-bold text-[#202124]">Join workspace</h1>
      <p className="mt-2 text-sm text-[#5F6368]">
        Accept the invitation to be added as a member. You must be signed in with the invited email.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-[#FCE8E6] bg-[#FCE8E6]/60 px-4 py-3 text-sm text-[#C5221F]">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={joining}
        onClick={() => void acceptInvite()}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6C3FF5] px-4 py-3 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-60"
      >
        {joining ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Joining…
          </>
        ) : (
          "Accept invite"
        )}
      </button>
      <Link href="/dashboard" className="mt-4 block text-center text-sm font-semibold text-[#6C3FF5] hover:text-[#5B2FE0]">
        Cancel
      </Link>
    </div>
  );
}

export default function InvitePage() {
  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA] px-4 py-16">
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#6C3FF5]" />
          </div>
        }
      >
        <InviteAcceptInner />
      </Suspense>
    </div>
  );
}
