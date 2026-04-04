import { describe, it, expect } from "vitest";
import {
  emailNotificationsSchema,
  emailToneSchema,
  summaryLengthSchema,
  languageSchema,
  preferencesSchema,
  botSettingsSchema
} from "./preferences";

describe("Validation Schemas", () => {
  describe("emailNotificationsSchema", () => {
    it("should validate valid email notifications", () => {
      const valid = {
        meetingSummary: true,
        actionItems: false,
        weeklyDigest: true,
        productUpdates: false
      };
      const result = emailNotificationsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email notifications", () => {
      const invalid = {
        meetingSummary: "yes",
        actionItems: false
      };
      const result = emailNotificationsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("emailToneSchema", () => {
    it("should validate valid email tones", () => {
      const validTones = ["professional", "friendly", "formal", "concise"];
      validTones.forEach(tone => {
        const result = emailToneSchema.safeParse(tone);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid email tones", () => {
      const result = emailToneSchema.safeParse("casual");
      expect(result.success).toBe(false);
    });
  });

  describe("summaryLengthSchema", () => {
    it("should validate valid summary lengths", () => {
      const validLengths = ["brief", "standard", "detailed"];
      validLengths.forEach(length => {
        const result = summaryLengthSchema.safeParse(length);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid summary lengths", () => {
      const result = summaryLengthSchema.safeParse("long");
      expect(result.success).toBe(false);
    });
  });

  describe("languageSchema", () => {
    it("should validate valid languages", () => {
      const validLanguages = ["en", "hi"];
      validLanguages.forEach(lang => {
        const result = languageSchema.safeParse(lang);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid languages", () => {
      const result = languageSchema.safeParse("fr");
      expect(result.success).toBe(false);
    });
  });

  describe("preferencesSchema", () => {
    it("should validate valid preferences with all fields", () => {
      const valid = {
        emailNotifications: {
          meetingSummary: true,
          actionItems: false,
          weeklyDigest: true,
          productUpdates: false
        },
        defaultEmailTone: "professional",
        summaryLength: "standard",
        language: "en"
      };
      const result = preferencesSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should validate preferences with partial fields", () => {
      const partial = {
        defaultEmailTone: "friendly",
        language: "hi"
      };
      const result = preferencesSchema.safeParse(partial);
      expect(result.success).toBe(true);
    });

    it("should validate empty preferences object", () => {
      const result = preferencesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should reject invalid field values", () => {
      const invalid = {
        defaultEmailTone: "invalid-tone"
      };
      const result = preferencesSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("botSettingsSchema", () => {
    it("should validate valid bot settings", () => {
      const valid = {
        botDisplayName: "My Custom Bot",
        audioSource: "pulse"
      };
      const result = botSettingsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should validate bot settings without audioSource", () => {
      const valid = {
        botDisplayName: "My Bot"
      };
      const result = botSettingsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject empty botDisplayName", () => {
      const invalid = {
        botDisplayName: "",
        audioSource: "default"
      };
      const result = botSettingsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject missing botDisplayName", () => {
      const invalid = {
        audioSource: "default"
      };
      const result = botSettingsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
