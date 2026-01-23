import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import type { Item } from "@/lib/db/schema.ts";
import { log } from "@/lib/utils/logger.ts";
import { getProfile, getState, matchesKeyword } from "@/lib/utils/state.ts";

function toMinimalItem(item: Item) {
	return {
		id: item.id,
		title: item.title,
		category: item.category,
		status: item.status,
		tags: item.tags.slice(0, 2),
	};
}

export const registerQueryState = (server: McpServer) => {
	server.registerTool(
		"query_state",
		{
			description: `${config.systemPrompt}\n\nQuery items from state or profile. Returns raw data for LLM to parse and format.\n\n**STATE** - Ephemeral/active work from state.yaml:\n- Goals: Active objectives with keyResults (OKR format)\n- Thoughts: Temporary ideas, plans, notes\n\n**PROFILE** - Persistent knowledge from profile.yaml:\n- Achievements, skills, projects, personal info, preferences, knowledge, facts, history\n\nFilter by view (goals/thoughts/profile), category, tags, or keyword (searches desc, category, and tags). Set minimal=true to return only essential fields (id, title, category, status, top 2 tags) to save tokens.`,
			inputSchema: {
				view: z
					.enum(["all", "goals", "thoughts", "profile"])
					.optional()
					.default("all")
					.describe(
						"View filter: 'goals' (state items with keyResults), 'thoughts' (state items without keyResults), 'profile' (persistent knowledge), or 'all'",
					),
				category: z
					.string()
					.optional()
					.describe(
						"Filter by category (works for goals, thoughts, and profile items)",
					),
				tags: z
					.array(z.string())
					.optional()
					.describe(
						"Filter thoughts/profile items that include all of these tags",
					),
				keyword: z
					.string()
					.optional()
					.describe(
						"Search keyword - matches items whose desc, category, or tags contain the keyword (case-insensitive)",
					),
				limit: z
					.number()
					.optional()
					.describe(
						"Limit number of items returned (optional, no limit if not specified)",
					),
				minimal: z
					.boolean()
					.optional()
					.default(false)
					.describe(
						"If true, returns only essential fields (id, title, category, status, top 2 tags) to save tokens when state is large",
					),
			},
		},
		async ({ view, category, tags, keyword, limit, minimal }) => {
			try {
				const state = await getState();
				const profile = await getProfile().catch(() => null);
				const output: Record<string, unknown> = {};

				if (view === "goals" || view === "all") {
					let goals = (state.items || []).filter(
						(item) => (item.keyResults?.length ?? 0) > 0,
					);
					if (category) {
						goals = goals.filter((g) => g.category === category);
					}
					if (keyword) {
						goals = goals.filter((g) => matchesKeyword(g, keyword));
					}
					if (limit !== undefined) {
						goals = goals.slice(0, limit);
					}
					output.goals = minimal ? goals.map(toMinimalItem) : goals;
				}

				if (view === "thoughts" || view === "all") {
					let thoughts = (state.items || []).filter(
						(item) => (item.keyResults?.length ?? 0) === 0,
					);
					if (category) {
						thoughts = thoughts.filter((i) => i.category === category);
					}
					if (tags && tags.length > 0) {
						thoughts = thoughts.filter((i) =>
							tags.every((tag) => i.tags.includes(tag)),
						);
					}
					if (keyword) {
						thoughts = thoughts.filter((i) => matchesKeyword(i, keyword));
					}
					if (limit !== undefined) {
						thoughts = thoughts.slice(0, limit);
					}
					output.thoughts = minimal ? thoughts.map(toMinimalItem) : thoughts;
				}

				if (view === "profile" || view === "all") {
					if (profile) {
						let items = profile.items || [];
						if (category) {
							items = items.filter((item) => item.category === category);
						}
						if (tags && tags.length > 0) {
							items = items.filter((item) =>
								tags.every((tag) => item.tags.includes(tag)),
							);
						}
						if (keyword) {
							items = items.filter((item) => matchesKeyword(item, keyword));
						}
						if (limit !== undefined) {
							items = items.slice(0, limit);
						}
						output.profile = {
							...profile,
							items: minimal ? items.map(toMinimalItem) : items,
						};
					} else {
						output.profile = null;
					}
				}

				await log(
					"info",
					"query_state",
					{ view, category, tags, keyword, limit, minimal },
					"State queried",
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
				const errorMsg = `Failed to query state: ${String(error)}`;
				await log(
					"error",
					"query_state",
					{ view, category, keyword, minimal },
					errorMsg,
				);
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
