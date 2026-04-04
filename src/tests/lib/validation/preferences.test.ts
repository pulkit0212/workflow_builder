/**
 * Unit tests for Zod validation schemas in `src/lib/validation/preferences.ts`
 *
 * **Task 21.2** — Validates Requirements 2.8, 3.5
 */

import { describe, it, expect } from "vitest";
import {
  emailNotificationsSchema,
  emailToneSchema,
  summaryLengthSchema,
  languageSchema,
  preferencesSchema,
  botSettingsSchema
} from "@/lib/validation/preferences";

describe("emailNotificationsSchema", () => {
  it("accepts a valid object", () => {
    const data = {
      meetingSummary: true,
      actionItems: false,
      weeklyDigest: true,
      productUpdates: false
    };
    expect(emailNotificationsSchema.parse(data)).toEqual(data);
  });

  it("rejects missing boolean fields", () => {
    expect(() =>
      emailNotificationsSchema.parse({
        meetingSummary: true
      })
    ).toThrow();
  });
});

describe("emailToneSchema", () => {
  it("accepts each enum value", () => {
    for (const tone of ["professional", "friendly", "formal", "concise"] as const) {
      expect(emailToneSchema.parse(tone)).toBe(tone);
    }
  });

  it("rejects invalid tone", () => {
    expect(() => emailToneSchema.parse("casual")).toThrow();
  });
});

describe("summaryLengthSchema", () => {
  it("accepts brief, standard, detailed", () => {
    expect(summaryLengthSchema.parse("brief")).toBe("brief");
    expect(summaryLengthSchema.parse("standard")).toBe("standard");
    expect(summaryLengthSchema.parse("detailed")).toBe("detailed");
  });

  it("rejects invalid length", () => {
    expect(() => summaryLengthSchema.parse("long")).toThrow();
  });
});

describe("languageSchema", () => {
  it("accepts en and hi", () => {
    expect(languageSchema.parse("en")).toBe("en");
    expect(languageSchema.parse("hi")).toBe("hi");
  });

  it("rejects other locales", () => {
    expect(() => languageSchema.parse("fr")).toThrow();
  });
});

describe("preferencesSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(preferencesSchema.parse({})).toEqual({});
  });

  it("accepts full valid payload", () => {
    const data = {
      emailNotifications: {
        meetingSummary: true,
        actionItems: true,
        weeklyDigest: false,
        productUpdates: true
      },
      defaultEmailTone: "formal" as const,
      summaryLength: "detailed" as const,
      language: "hi" as const
    };
    expect(preferencesSchema.parse(data)).toEqual(data);
  });

  it("fails with descriptive error for invalid email tone", () => {
    const result = preferencesSchema.safeParse({
      defaultEmailTone: "invalid"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("defaultEmailTone"))).toBe(true);
    }
  });
});

describe("botSettingsSchema", () => {
  it("accepts non-empty botDisplayName", () => {
    expect(botSettingsSchema.parse({ botDisplayName: "My Bot" })).toEqual({
      botDisplayName: "My Bot"
    });
  });

  it("accepts optional audioSource", () => {
    expect(
      botSettingsSchema.parse({
        botDisplayName: "Bot",
        audioSource: "pulse"
      })
    ).toEqual({ botDisplayName: "Bot", audioSource: "pulse" });
  });

  it("rejects empty botDisplayName with message", () => {
    const result = botSettingsSchema.safeParse({ botDisplayName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain("empty");
    }
  });

});
