import { SignUp } from "@clerk/nextjs";
import { ClerkMissingState } from "@/components/auth/clerk-missing-state";
import { hasClerkPublishableKey } from "@/lib/auth/clerk-env";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030712] px-4 py-10">
      {hasClerkPublishableKey ? (
        <SignUp fallbackRedirectUrl="/dashboard" />
      ) : (
        <ClerkMissingState
          title="Sign up is unavailable"
          description="This local build does not have Clerk configured yet, so the authentication UI is disabled until the required environment variables are set."
        />
      )}
    </main>
  );
}
