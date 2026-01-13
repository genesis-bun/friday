import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { log } from "@/lib/utils/logger.ts";
import { getProfile } from "@/lib/utils/profile.ts";
import { getState } from "@/lib/utils/state.ts";

export const registerViewStatus = (server: McpServer) => {
	server.registerTool(
		"view_status",
		{
			description: `${config.systemPrompt}\n\nView raw data for goals, ideas, and profile. Returns unprocessed data for LLM to parse and format.\n\n**Profile:** Persistent data organized by categories (achievements, skills, projects, personal, music, preferences, knowledge, facts, history, etc.). Each item has: id, category, content, tags, metadata, refNotes, timestamps. Profile persists across state rotations.\n\n**Goals:** OKR format with keyResults, calendarEventId, status (active/paused/completed/archived).\n\n**Ideas:** Have status (raw/organized/actionable/archived), priority, relatedGoalId.\n\nFilter by category (goals/ideas/profile) or tags (ideas/profile).`,
			inputSchema: {
				view: z
					.enum(["all", "goals", "ideas", "profile"])
					.optional()
					.default("all"),
				category: z
					.string()
					.optional()
					.describe(
						"Filter by category (works for goals, ideas, and profile items)",
					),
				tags: z
					.array(z.string())
					.optional()
					.describe(
						"Filter ideas/profile items that include all of these tags",
					),
				limit: z
					.number()
					.optional()
					.describe(
						"Limit number of items returned (optional, no limit if not specified)",
					),
			},
		},
		async ({ view, category, tags, limit }) => {
			try {
				const state = await getState();
				const profile = await getProfile().catch(() => null); // Graceful degradation
				const output: Record<string, unknown> = {};

				if (view === "goals" || view === "all") {
					let goals = state.data.goals;
					if (category) {
						goals = goals.filter((g) => g.category === category);
					}
					if (limit !== undefined) {
						goals = goals.slice(0, limit);
					}
					output.goals = goals;
				}

				if (view === "ideas" || view === "all") {
					let ideas = state.data.ideas;
					if (category) {
						ideas = ideas.filter((i) => i.category === category);
					}
					if (tags && tags.length > 0) {
						ideas = ideas.filter((i) =>
							tags.every((tag) => i.tags.includes(tag)),
						);
					}
					if (limit !== undefined) {
						ideas = ideas.slice(0, limit);
					}
					output.ideas = ideas;
				}

				if ((view === "profile" || view === "all") && profile) {
					let items = profile.items;
					if (category) {
						items = items.filter((item) => item.category === category);
					}
					if (tags && tags.length > 0) {
						items = items.filter((item) =>
							tags.every((tag) => item.tags.includes(tag)),
						);
					}
					if (limit !== undefined) {
						items = items.slice(0, limit);
					}
					output.profile = { ...profile, items };
				}

				await log(
					"info",
					"view_status",
					{ view, category, tags, limit },
					"Status viewed",
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(output, null, 2),
						},
					],
				};
			} catch (error) {
				const errorMsg = `Failed to view status: ${String(error)}`;
				await log("error", "view_status", { view, category }, errorMsg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ success: false, error: errorMsg },
								null,
								2,
							),
						},
					],
				};
			}
		},
	);
};
