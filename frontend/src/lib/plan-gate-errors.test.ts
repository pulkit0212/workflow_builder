import { describe, expect, it } from "vitest";
import {
  getPlanGateUserMessage,
  isEliteRequired,
  isPlanGatedResponse,
  isUpgradeRequired,
} from "@/lib/plan-gate-errors";

describe("plan-gate-errors", () => {
  it("detects upgrade_required and elite_required", () => {
    expect(isUpgradeRequired({ error: "upgrade_required", currentPlan: "free" })).toBe(true);
    expect(isEliteRequired({ error: "elite_required", currentPlan: "pro" })).toBe(true);
    expect(isPlanGatedResponse(403, { error: "upgrade_required" })).toBe(true);
    expect(isPlanGatedResponse(403, { error: "elite_required" })).toBe(true);
    expect(isPlanGatedResponse(401, { error: "upgrade_required" })).toBe(false);
  });

  it("prefers API message, then feature copy", () => {
    expect(
      getPlanGateUserMessage({
        error: "upgrade_required",
        message: "Custom upgrade message",
      })
    ).toBe("Custom upgrade message");

    expect(
      getPlanGateUserMessage({ error: "upgrade_required", feature: "action_items" })
    ).toContain("Pro and Elite");
  });
});
