import { relations } from "drizzle-orm";
import {
	pgTable,
	integer,
	jsonb,
	timestamp,
	uniqueIndex,
	uuid,
	text,
} from "drizzle-orm/pg-core";

export const users = pgTable(
	"users",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		githubId: text("github_id"),
		githubLogin: text("github_login"),
		displayName: text("display_name"),
		email: text("email"),
		avatarUrl: text("avatar_url"),
		passwordHash: text("password_hash"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({ githubIdIndex: uniqueIndex("users_github_id_idx").on(table.githubId) }),
);

export const sessions = pgTable("sessions", {
	id: text("id").primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userProfiles = pgTable(
	"user_profiles",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		gitLevel: integer("git_level").notNull().default(1),
		collabLevel: integer("collab_level").notNull().default(1),
		skills: jsonb("skills").$type<Record<string, number>>().notNull().default({}),
		knowledge: jsonb("knowledge").$type<string[]>().notNull().default([]),
		hours: text("hours").notNull().default("2-5"),
		interests: jsonb("interests").$type<string[]>().notNull().default([]),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({ userIdIndex: uniqueIndex("user_profiles_user_id_idx").on(table.userId) }),
);

export const contributionWorkspaces = pgTable(
	"contribution_workspaces",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		issueNumber: integer("issue_number"),
		issueTitle: text("issue_title"),
		status: text("status").notNull().default("planned"),
		notes: text("notes").notNull().default(""),
		draftComment: text("draft_comment").notNull().default(""),
		branchName: text("branch_name").notNull().default(""),
		prUrl: text("pr_url").notNull().default(""),
		checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull().default({}),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({ userIdIndex: uniqueIndex("contribution_workspaces_user_id_idx").on(table.userId) }),
);

export const usersRelations = relations(users, ({ many, one }) => ({
	sessions: many(sessions),
	profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
	workspace: one(contributionWorkspaces, { fields: [users.id], references: [contributionWorkspaces.userId] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type ContributionWorkspace = typeof contributionWorkspaces.$inferSelect;