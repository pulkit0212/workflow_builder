"use client";

import { useEffect, useState } from "react";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";
import {
  normalizeSubscriptionLimits,
  type PlanId,
  type SubscriptionLimits,
} from "@/lib/subscription";

type SubscriptionApiResponse = {
  plan?: PlanId;
  limits?: Partial<SubscriptionLimits>;
};

export function useSubscriptionLimits() {
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [plan, setPlan] = useState<PlanId>("free");
  const [limits, setLimits] = useState<SubscriptionLimits>(() =>
    normalizeSubscriptionLimits("free")
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return;

    let mounted = true;

    void (async () => {
      try {
        const res = await apiFetch("/api/subscription", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as SubscriptionApiResponse;
        const nextPlan = (data.plan ?? "free") as PlanId;
        if (mounted) {
          setPlan(nextPlan);
          setLimits(normalizeSubscriptionLimits(nextPlan, data.limits));
        }
      } catch {
        /* keep defaults */
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [apiFetch, isAuthReady]);

  return { plan, limits, isLoading };
}
