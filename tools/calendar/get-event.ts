import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { getEvent } from "@/lib/utils/calendar.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerGetEvent = (server: McpServer) => {
	server.registerTool(
		"get_event",
		{
			description: `${config.systemPrompt}\n\nGet full Google Calendar event data by event ID. Returns raw event payload (plus a few convenience fields like meetLink and recurring metadata).`,
			inputSchema: {
				eventId: z
					.string()
					.describe(
						"Event ID from Google Calendar (can get from manage_event or list_events)",
					),
			},
		},
		async ({ eventId }) => {
			try {
				const event = await getEvent(eventId);

				await log(
					"info",
					"get_event",
					{ eventId },
					`Retrieved calendar event: ${event.summary || eventId}`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									...event,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "get_event", { eventId }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error getting event: ${msg}`,
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);
};

