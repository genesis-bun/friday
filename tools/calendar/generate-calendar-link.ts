import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { generateCalendarLink, getEvent } from "@/lib/utils/calendar.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerGenerateCalendarLink = (server: McpServer) => {
	server.registerTool(
		"generate_calendar_link",
		{
			description: `${config.systemPrompt}\n\nGenerate a Google Calendar "Add to Calendar" link for an existing event. This link allows recipients to add the event to their calendar with one click.`,
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
				const calendarLink = generateCalendarLink(event);

				await log(
					"info",
					"generate_calendar_link",
					{ eventId },
					`Generated calendar link for event: ${event.summary || eventId}`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									eventId,
									calendarLink,
									eventSummary: event.summary,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "generate_calendar_link", { eventId }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error generating calendar link: ${msg}`,
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
