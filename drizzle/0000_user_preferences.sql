CREATE TABLE IF NOT EXISTS "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_notifications" jsonb DEFAULT '{"meetingSummary":true,"actionItems":false,"weeklyDigest":false,"productUpdates":true}'::jsonb NOT NULL,
	"default_email_tone" varchar(50) DEFAULT 'professional' NOT NULL,
	"summary_length" varchar(50) DEFAULT 'standard' NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"bot_display_name" varchar(255) DEFAULT 'Artiva Notetaker' NOT NULL,
	"audio_source" varchar(255) DEFAULT 'default' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
