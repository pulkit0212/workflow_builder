import { auth } from "@clerk/nextjs/server";
import { LandingPage as MarketingLandingPage } from "@/components/marketing/landing-page";
import { isClerkConfigured } from "@/lib/auth/clerk-env";

export default async function LandingPage() {
  const userId = isClerkConfigured ? (await auth()).userId : null;

  return <MarketingLandingPage isAuthenticated={Boolean(userId)} />;
}
