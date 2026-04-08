CREATE TABLE "workspace_move_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_items" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_sessions" ADD COLUMN "workspace_move_status" varchar(50);--> statement-breakpoint
ALTER TABLE "meeting_sessions" ADD COLUMN "workspace_moved_by" varchar(255);--> statement-breakpoint
ALTER TABLE "meeting_sessions" ADD COLUMN "workspace_moved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "type" varchar(50) DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_move_requests" ADD CONSTRAINT "workspace_move_requests_meeting_id_meeting_sessions_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_move_requests" ADD CONSTRAINT "workspace_move_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_move_requests" ADD CONSTRAINT "workspace_move_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_move_requests" ADD CONSTRAINT "workspace_move_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;