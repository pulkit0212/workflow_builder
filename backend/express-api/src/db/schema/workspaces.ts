import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("team"),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("member"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceUserIdx: uniqueIndex("workspace_members_workspace_user_uidx").on(table.workspaceId, table.userId),
    userIdx: index("workspace_members_user_id_idx").on(table.userId),
    workspaceIdx: index("workspace_members_workspace_id_idx").on(table.workspaceId),
  })
);

export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    invitedEmail: varchar("invited_email", { length: 255 }).notNull(),
    invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 128 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("workspace_invites_token_uidx").on(table.token),
    pendingEmailWorkspaceIdx: uniqueIndex("workspace_invites_pending_email_workspace_uidx")
      .on(table.workspaceId, table.invitedEmail)
      .where(sql`status = 'pending'`),
    workspaceIdx: index("workspace_invites_workspace_id_idx").on(table.workspaceId),
  })
);
