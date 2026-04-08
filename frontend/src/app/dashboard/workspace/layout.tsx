"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkWorkspaceMembership() {
      try {
        const res = await fetch("/api/workspaces");
        if (res.ok) {
          const data = await res.json();
          if (!data.workspaces || data.workspaces.length === 0) {
            router.replace("/dashboard/workspaces");
            return;
          }
        }
      } catch {
        // On error, allow the page to render — the individual pages handle their own errors
      }
      setChecked(true);
    }

    checkWorkspaceMembership();
  }, [router]);

  if (!checked) {
    return null;
  }

  return <>{children}</>;
}
