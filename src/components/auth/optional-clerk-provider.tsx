import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured, warnIfClerkMissing } from "@/lib/auth/clerk-env";

export function OptionalClerkProvider({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured) {
    warnIfClerkMissing("root layout");
    return <>{children}</>;
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}
