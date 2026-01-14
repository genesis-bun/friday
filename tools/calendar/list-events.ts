import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { listEvents } from "@/lib/utils/calendar.ts";
import { log } from "@/lib/utils/logger.ts";
import { getState } from "@/lib/utils/state.ts";

export const registerListEvents = (server: McpServer) => {
	server.registerTool(
		"list_events",
		{
			description: `${config.systemPrompt}\n\nGets upcoming calendar events and current goals from state. Returns raw data for LLM to parse and present.\n\nHandles both normal and recurring events. Recurring events show as individual instances with recurrence metadata.`,
			inputSchema: {
				days: z
					.number()
					.optional()
					.default(30)
					.describe("Number of days ahead to check (default: 30)"),
				maxResults: z
					.number()
					.optional()
					.describe("Maximum number of events to return (default: 50)"),
				includeRecurringMasters: z
					.boolean()
					.optional()
					.default(false)
					.describe(
						"Include recurring event masters in addition to instances (default: false)",
					),
			},
		},
		async ({ days = 30, maxResults, includeRecurringMasters = false }) => {
			try {
				const events = await listEvents({ days, maxResults, includeRecurringMasters });
				const state = await getState();
				const goals = state.items.filter(
					(item) => (item.keyResults?.length ?? 0) > 0,
				);
				const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();

				const recurringMasters = events.filter((e) => e._isRecurringMaster);
				const recurringInstances = events.filter((e) => e._isRecurringInstance);
				const normalEvents = events.filter(
					(e) => !e._isRecurringMaster && !e._isRecurringInstance,
				);

				const simplifiedEvents = events.map((event) => {
					const simplified: Record<string, unknown> = {
						id: event.id,
						summary: event.summary,
						start: event.start,
						end: event.end,
						status: event.status,
					};

					if (event.description) simplified.description = event.description;
					if (event.location) simplified.location = event.location;
					if (event.htmlLink) simplified.htmlLink = event.htmlLink;
					if (event.recurrence) simplified.recurrence = event.recurrence;
					if (event.recurringEventId) simplified.recurringEventId = event.recurringEventId;
					if (event._isRecurringMaster) simplified.isRecurringMaster = true;
					if (event._isRecurringInstance) simplified.isRecurringInstance = true;

					return simplified;
				});

				const simplifiedGoals = goals.map((goal) => ({
					id: goal.id,
					category: goal.category,
					desc: goal.desc,
					status: goal.status,
					keyResults: goal.keyResults?.map((kr) => ({
						id: kr.id,
						desc: kr.desc,
						status: kr.status,
						current: kr.current,
						target: kr.target,
						unit: kr.unit,
					})),
					createdAt: goal.createdAt,
					updatedAt: goal.updatedAt,
				}));

				const result = {
					calendar_events: simplifiedEvents,
					summary: {
						total: events.length,
						normal: normalEvents.length,
						recurring_masters: recurringMasters.length,
						recurring_instances: recurringInstances.length,
					},
					state_goals: simplifiedGoals,
					time_range: {
						from: new Date().toISOString(),
						to: timeMax,
						days_ahead: days,
					},
				};

				await log(
					"info",
					"check_schedule",
					{ days },
					`Retrieved ${events.length} calendar events and ${goals.length} goals`,
				);
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "check_schedule", { days }, msg);
				return {
					content: [{ type: "text", text: `Error checking schedule: ${msg}` }],
					isError: true,
				};
			}
		},
	);
};
