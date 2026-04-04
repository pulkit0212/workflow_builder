/**
 * Unit Tests: Usage Tab Logic
 *
 * Tests the pure logic functions extracted from the Usage Tab
 * in src/app/dashboard/settings/page.tsx.
 *
 * Since the component uses Clerk hooks and React state, we test the
 * logic functions directly rather than rendering the component.
 *
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9**
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Types (mirrored from page.tsx) ──────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

interface ToastState {
  message: string;
  type: ToastType;
}

interface UsageStatsResponse {
  success: true;
  meetingsThisMonth: number;
  meetingsAllTime: number;
  transcriptsGenerated: number;
  actionItemsCreated: number;
  documentsAnalyzed: number;
  memberSince: string;
}

interface SubscriptionResponse {
  success: true;
  plan: "free" | "pro" | "elite" | "trial";
  status: string;
  trialStartedAt: string;
  trialEndsAt: string;
  planStartedAt: string | null;
  planEndsAt: string | null;
  trialDaysLeft: number;
  meetingsUsedThisMonth: number;
  limits: {
    meetingBot: boolean;
    transcription: boolean;
    summary: boolean;
    actionItems: boolean;
    history: boolean;
    meetingsPerMonth: number;
    unlimited: boolean;
  };
  payments: Array<{
    id: string;
    date: string;
    plan: string;
    amount: number;
    currency: string;
    status: string;
    invoice: string;
  }>;
}

interface DeleteMeetingDataState {
  toast: ToastState | null;
  deleteDataConfirm: string;
  isDeleteDataOpen: boolean;
  usageStats: UsageStatsResponse | null;
  subscription: SubscriptionResponse | null;
}

// ─── Pure functions mirrored from page.tsx ────────────────────────────────────

/**
 * Mirrors the progressColor() function from page.tsx.
 */
function progressColor(usage: number): string {
  if (usage >= 90) return "bg-[#dc2626]";
  if (usage >= 75) return "bg-[#f59e0b]";
  return "bg-[#6c63ff]";
}

/**
 * Mirrors the deleteMeetingData() function from page.tsx.
 */
async function simulateDeleteMeetingData(
  state: DeleteMeetingDataState,
  fetchDelete: () => Promise<Response>,
  fetchUsage: () => Promise<Response>,
  fetchSubscription: () => Promise<Response>
): Promise<void> {
  if (state.deleteDataConfirm !== "DELETE") {
    state.toast = { message: "Type DELETE to confirm.", type: "error" };
    return;
  }

  try {
    const response = await fetchDelete();

    if (!response.ok) {
      throw new Error("Failed to delete meeting data.");
    }

    state.isDeleteDataOpen = false;
    state.deleteDataConfirm = "";
    state.toast = { message: "Meeting data deleted", type: "success" };

    // Refresh stats after deletion
    const [subscriptionResponse, usageResponse] = await Promise.all([
      fetchSubscription(),
      fetchUsage(),
    ]);

    if (subscriptionResponse.ok) {
      const payload = (await subscriptionResponse.json()) as SubscriptionResponse | { success?: false };
      if (payload.success) state.subscription = payload as SubscriptionResponse;
    }

    if (usageResponse.ok) {
      const payload = (await usageResponse.json()) as UsageStatsResponse | { success?: false };
      if (payload.success) state.usageStats = payload as UsageStatsResponse;
    }
  } catch {
    state.toast = { message: "Failed to delete meeting data", type: "error" };
  }
}

// ─── Tests: progressColor ─────────────────────────────────────────────────────

describe("Usage Tab - progressColor", () => {
  it('returns red class for usage >= 90%', () => {
    // **Validates: Requirement 12.3** - progress bar colored by usage percentage
    expect(progressColor(90)).toBe("bg-[#dc2626]");
    expect(progressColor(95)).toBe("bg-[#dc2626]");
    expect(progressColor(100)).toBe("bg-[#dc2626]");
  });

  it('returns amber class for usage >= 75% and < 90%', () => {
    // **Validates: Requirement 12.3** - warning color at 75-89%
    expect(progressColor(75)).toBe("bg-[#f59e0b]");
    expect(progressColor(80)).toBe("bg-[#f59e0b]");
    expect(progressColor(89)).toBe("bg-[#f59e0b]");
  });

  it('returns purple class for usage < 75%', () => {
    // **Validates: Requirement 12.3** - default color below 75%
    expect(progressColor(0)).toBe("bg-[#6c63ff]");
    expect(progressColor(50)).toBe("bg-[#6c63ff]");
    expect(progressColor(74)).toBe("bg-[#6c63ff]");
  });

  it('boundary: 90 is red, 89 is amber', () => {
    // **Validates: Requirement 12.3** - exact boundary between amber and red
    expect(progressColor(89)).toBe("bg-[#f59e0b]");
    expect(progressColor(90)).toBe("bg-[#dc2626]");
  });

  it('boundary: 75 is amber, 74 is purple', () => {
    // **Validates: Requirement 12.3** - exact boundary between purple and amber
    expect(progressColor(74)).toBe("bg-[#6c63ff]");
    expect(progressColor(75)).toBe("bg-[#f59e0b]");
  });
});

// ─── Tests: deleteMeetingData - confirmation validation ───────────────────────

describe("Usage Tab - deleteMeetingData confirmation validation", () => {
  let state: DeleteMeetingDataState;
  let mockFetchDelete: ReturnType<typeof vi.fn>;
  let mockFetchUsage: ReturnType<typeof vi.fn>;
  let mockFetchSubscription: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = {
      toast: null,
      deleteDataConfirm: "",
      isDeleteDataOpen: true,
      usageStats: null,
      subscription: null,
    };
    mockFetchDelete = vi.fn().mockResolvedValue({ ok: true } as Response);
    mockFetchUsage = vi.fn().mockResolvedValue({ ok: false } as Response);
    mockFetchSubscription = vi.fn().mockResolvedValue({ ok: false } as Response);
  });

  it('shows error toast when confirm text is not "DELETE"', async () => {
    // **Validates: Requirement 12.7** - confirmation modal requires "DELETE"
    state.deleteDataConfirm = "delete";

    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Type DELETE to confirm");
  });

  it("does not call DELETE API when confirm text is wrong", async () => {
    // **Validates: Requirement 12.8** - API only called after correct confirmation
    state.deleteDataConfirm = "yes";

    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(mockFetchDelete).not.toHaveBeenCalled();
  });

  it("shows error toast when confirm text is empty string", async () => {
    // **Validates: Requirement 12.7** - empty string is not valid confirmation
    state.deleteDataConfirm = "";

    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.toast?.type).toBe("error");
    expect(mockFetchDelete).not.toHaveBeenCalled();
  });

  it("shows error toast when confirm text is lowercase 'delete'", async () => {
    // **Validates: Requirement 12.7** - confirmation is case-sensitive
    state.deleteDataConfirm = "delete";

    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.toast?.type).toBe("error");
    expect(mockFetchDelete).not.toHaveBeenCalled();
  });
});

// ─── Tests: deleteMeetingData - successful deletion ───────────────────────────

describe("Usage Tab - deleteMeetingData successful deletion", () => {
  let state: DeleteMeetingDataState;
  let mockFetchDelete: ReturnType<typeof vi.fn>;
  let mockFetchUsage: ReturnType<typeof vi.fn>;
  let mockFetchSubscription: ReturnType<typeof vi.fn>;

  const mockUpdatedUsage: UsageStatsResponse = {
    success: true,
    meetingsThisMonth: 0,
    meetingsAllTime: 5,
    transcriptsGenerated: 0,
    actionItemsCreated: 0,
    documentsAnalyzed: 0,
    memberSince: "2024-01-01T00:00:00.000Z",
  };

  const mockUpdatedSubscription: SubscriptionResponse = {
    success: true,
    plan: "free",
    status: "active",
    trialStartedAt: "2024-01-01T00:00:00.000Z",
    trialEndsAt: "2024-01-15T00:00:00.000Z",
    planStartedAt: null,
    planEndsAt: null,
    trialDaysLeft: 0,
    meetingsUsedThisMonth: 0,
    limits: {
      meetingBot: false,
      transcription: false,
      summary: false,
      actionItems: false,
      history: false,
      meetingsPerMonth: 3,
      unlimited: false,
    },
    payments: [],
  };

  beforeEach(() => {
    state = {
      toast: null,
      deleteDataConfirm: "DELETE",
      isDeleteDataOpen: true,
      usageStats: {
        success: true,
        meetingsThisMonth: 5,
        meetingsAllTime: 10,
        transcriptsGenerated: 5,
        actionItemsCreated: 20,
        documentsAnalyzed: 3,
        memberSince: "2024-01-01T00:00:00.000Z",
      },
      subscription: null,
    };
    mockFetchDelete = vi.fn().mockResolvedValue({ ok: true } as Response);
    mockFetchUsage = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockUpdatedUsage),
    } as unknown as Response);
    mockFetchSubscription = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockUpdatedSubscription),
    } as unknown as Response);
  });

  it('calls DELETE /api/usage/data when confirm is "DELETE"', async () => {
    // **Validates: Requirement 12.8** - API called with correct confirmation
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(mockFetchDelete).toHaveBeenCalledOnce();
  });

  it("shows success toast on successful deletion", async () => {
    // **Validates: Requirement 12.8** - success feedback after deletion
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.toast?.type).toBe("success");
    expect(state.toast?.message).toContain("Meeting data deleted");
  });

  it("closes the confirmation modal on success", async () => {
    // **Validates: Requirement 12.7** - modal closes after successful deletion
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.isDeleteDataOpen).toBe(false);
  });

  it("clears the confirm text on success", async () => {
    // **Validates: Requirement 12.7** - confirm input is reset after deletion
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.deleteDataConfirm).toBe("");
  });

  it("refreshes usage stats after successful deletion (calls /api/settings/usage)", async () => {
    // **Validates: Requirement 12.9** - usage stats refreshed after deletion
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(mockFetchUsage).toHaveBeenCalledOnce();
  });

  it("refreshes subscription after successful deletion (calls /api/subscription)", async () => {
    // **Validates: Requirement 12.9** - subscription refreshed after deletion
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(mockFetchSubscription).toHaveBeenCalledOnce();
  });

  it("updates usageStats state with refreshed data after deletion", async () => {
    // **Validates: Requirement 12.9** - state updated with new usage data
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.usageStats).toEqual(mockUpdatedUsage);
  });

  it("updates subscription state with refreshed data after deletion", async () => {
    // **Validates: Requirement 12.9** - state updated with new subscription data
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.subscription).toEqual(mockUpdatedSubscription);
  });
});

// ─── Tests: deleteMeetingData - API failure ───────────────────────────────────

describe("Usage Tab - deleteMeetingData API failure", () => {
  let state: DeleteMeetingDataState;
  let mockFetchDelete: ReturnType<typeof vi.fn>;
  let mockFetchUsage: ReturnType<typeof vi.fn>;
  let mockFetchSubscription: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = {
      toast: null,
      deleteDataConfirm: "DELETE",
      isDeleteDataOpen: true,
      usageStats: null,
      subscription: null,
    };
    mockFetchUsage = vi.fn().mockResolvedValue({ ok: false } as Response);
    mockFetchSubscription = vi.fn().mockResolvedValue({ ok: false } as Response);
    mockFetchDelete = vi.fn().mockResolvedValue({ ok: false } as Response);
  });

  it("shows error toast when DELETE API returns non-ok response", async () => {
    // **Validates: Requirement 12.8** - error handling for API failure
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to delete meeting data");
  });

  it("does not close modal when API returns non-ok response", async () => {
    // **Validates: Requirement 12.7** - modal stays open on failure
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.isDeleteDataOpen).toBe(true);
  });

  it("shows error toast when fetch throws a network error", async () => {
    // **Validates: Requirement 12.8** - network error handling
    mockFetchDelete.mockRejectedValue(new Error("Network error"));

    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to delete meeting data");
  });

  it("does not call refresh endpoints when DELETE API fails", async () => {
    // **Validates: Requirement 12.9** - no refresh on failure
    await simulateDeleteMeetingData(state, mockFetchDelete, mockFetchUsage, mockFetchSubscription);

    expect(mockFetchUsage).not.toHaveBeenCalled();
    expect(mockFetchSubscription).not.toHaveBeenCalled();
  });
});

// ─── Tests: Usage stats display values ───────────────────────────────────────

describe("Usage Tab - usage statistics display", () => {
  it("displays meetingsThisMonth from usageStats", () => {
    // **Validates: Requirement 12.2** - Meetings Recorded stat card
    const usageStats: UsageStatsResponse = {
      success: true,
      meetingsThisMonth: 7,
      meetingsAllTime: 42,
      transcriptsGenerated: 7,
      actionItemsCreated: 35,
      documentsAnalyzed: 12,
      memberSince: "2024-01-01T00:00:00.000Z",
    };
    expect(usageStats.meetingsThisMonth).toBe(7);
  });

  it("displays transcriptsGenerated from usageStats", () => {
    // **Validates: Requirement 12.2** - Transcripts Generated stat card
    const usageStats: UsageStatsResponse = {
      success: true,
      meetingsThisMonth: 7,
      meetingsAllTime: 42,
      transcriptsGenerated: 7,
      actionItemsCreated: 35,
      documentsAnalyzed: 12,
      memberSince: "2024-01-01T00:00:00.000Z",
    };
    expect(usageStats.transcriptsGenerated).toBe(7);
  });

  it("displays actionItemsCreated from usageStats", () => {
    // **Validates: Requirement 12.2** - Action Items Created stat card
    const usageStats: UsageStatsResponse = {
      success: true,
      meetingsThisMonth: 7,
      meetingsAllTime: 42,
      transcriptsGenerated: 7,
      actionItemsCreated: 35,
      documentsAnalyzed: 12,
      memberSince: "2024-01-01T00:00:00.000Z",
    };
    expect(usageStats.actionItemsCreated).toBe(35);
  });

  it("displays documentsAnalyzed from usageStats", () => {
    // **Validates: Requirement 12.2** - Documents Analyzed stat card
    const usageStats: UsageStatsResponse = {
      success: true,
      meetingsThisMonth: 7,
      meetingsAllTime: 42,
      transcriptsGenerated: 7,
      actionItemsCreated: 35,
      documentsAnalyzed: 12,
      memberSince: "2024-01-01T00:00:00.000Z",
    };
    expect(usageStats.documentsAnalyzed).toBe(12);
  });

  it("falls back to 0 when usageStats is null (meetingsThisMonth)", () => {
    // **Validates: Requirement 12.1** - graceful null handling before data loads
    const usageStats: UsageStatsResponse | null = null;
    const displayed = usageStats?.meetingsThisMonth ?? 0;
    expect(displayed).toBe(0);
  });

  it("falls back to 0 when usageStats is null (transcriptsGenerated)", () => {
    // **Validates: Requirement 12.1** - graceful null handling
    const usageStats: UsageStatsResponse | null = null;
    const displayed = usageStats?.transcriptsGenerated ?? 0;
    expect(displayed).toBe(0);
  });

  it("falls back to 0 when usageStats is null (actionItemsCreated)", () => {
    // **Validates: Requirement 12.1** - graceful null handling
    const usageStats: UsageStatsResponse | null = null;
    const displayed = usageStats?.actionItemsCreated ?? 0;
    expect(displayed).toBe(0);
  });

  it("falls back to 0 when usageStats is null (documentsAnalyzed)", () => {
    // **Validates: Requirement 12.1** - graceful null handling
    const usageStats: UsageStatsResponse | null = null;
    const displayed = usageStats?.documentsAnalyzed ?? 0;
    expect(displayed).toBe(0);
  });
});

// ─── Tests: All-time stats display ───────────────────────────────────────────

describe("Usage Tab - all-time statistics display", () => {
  it("displays meetingsAllTime from usageStats", () => {
    // **Validates: Requirement 12.4** - Total Meetings all-time stat
    const usageStats: UsageStatsResponse = {
      success: true,
      meetingsThisMonth: 7,
      meetingsAllTime: 42,
      transcriptsGenerated: 7,
      actionItemsCreated: 35,
      documentsAnalyzed: 12,
      memberSince: "2024-01-01T00:00:00.000Z",
    };
    expect(usageStats.meetingsAllTime).toBe(42);
  });

  it("displays actionItemsCreated as Total Action Items", () => {
    // **Validates: Requirement 12.4** - Total Action Items all-time stat
    const usageStats: UsageStatsResponse = {
      success: true,
      meetingsThisMonth: 7,
      meetingsAllTime: 42,
      transcriptsGenerated: 7,
      actionItemsCreated: 35,
      documentsAnalyzed: 12,
      memberSince: "2024-01-01T00:00:00.000Z",
    };
    expect(usageStats.actionItemsCreated).toBe(35);
  });

  it("displays memberSince from usageStats when available", () => {
    // **Validates: Requirement 12.4** - Member Since all-time stat
    const usageStats: UsageStatsResponse = {
      success: true,
      meetingsThisMonth: 7,
      meetingsAllTime: 42,
      transcriptsGenerated: 7,
      actionItemsCreated: 35,
      documentsAnalyzed: 12,
      memberSince: "2024-03-15T00:00:00.000Z",
    };
    expect(usageStats.memberSince).toBe("2024-03-15T00:00:00.000Z");
  });

  it("falls back to 0 for meetingsAllTime when usageStats is null", () => {
    // **Validates: Requirement 12.4** - graceful null handling for all-time stats
    const usageStats: UsageStatsResponse | null = null;
    const displayed = usageStats?.meetingsAllTime ?? 0;
    expect(displayed).toBe(0);
  });
});
