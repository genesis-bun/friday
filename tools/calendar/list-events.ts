import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { listEvents } from "@/lib/utils/calendar.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerListEvents = (server: McpServer) => {
	server.registerTool(
		"list_events",
		{
			description: `${config.systemPrompt}\n\nList upcoming Google Calendar events. Returns a minimal event shape to minimize tokens (use get_event for full event details).`,
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
				const events = await listEvents({
					days,
					maxResults,
					includeRecurringMasters,
				});
				const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();

				const simplifiedEvents = events.map((event) => ({
					id: event.id,
					summary: event.summary,
					start: event.start,
					end: event.end,
					status: event.status,
				}));

				const result = {
					calendar_events: simplifiedEvents,
					time_range: {
						from: new Date().toISOString(),
						to: timeMax,
						days_ahead: days,
					},
				};

				await log(
					"info",
					"list_events",
					{ days },
					`Retrieved ${events.length} calendar events`,
				);
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "list_events", { days }, msg);
				return {
					content: [{ type: "text", text: `Error checking schedule: ${msg}` }],
					isError: true,
				};
			}
		},
	);
};
