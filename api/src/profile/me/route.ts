import { apiError, apiSuccess } from "@/lib/api-responses";
import { getCurrentClerkUser } from "@/lib/auth/current-user";
import { isClerkConfigured } from "@/lib/auth/clerk-env";
import { getCurrentAuthenticatedProfile } from "@/lib/auth/profile";

export async function GET() {
  try {
    if (!isClerkConfigured) {
      return apiError("Authentication is not configured.", 503);
    }

    const clerkUser = await getCurrentClerkUser();

    if (!clerkUser) {
      return apiError("Unauthorized.", 401);
    }

    const profile = await getCurrentAuthenticatedProfile({
      expectedClerkUserId: clerkUser.clerkUserId,
      sync: true
    });

    if (!profile) {
      return apiError("Unauthorized.", 401);
    }

    return apiSuccess({
      success: true,
      profile: {
        id: profile.id,
        clerkUserId: profile.clerkUserId,
        email: profile.email,
        fullName: profile.fullName,
        plan: profile.plan
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = message === "Authenticated user mismatch." ? 403 : 500;

    return apiError(message, status);
  }
}
