import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import {
	createEvent,
	deleteEvent,
	type Event,
	generateCalendarLink,
	updateEvent,
} from "@/lib/utils/calendar.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerManageCalendarEvent = (server: McpServer) => {
	server.registerTool(
		"manage_event",
		{
			description: `${config.systemPrompt}\n\nCreate, update, or delete events in Google Calendar. Times must be in format "DD-MM-YYYY HH-MM" (e.g., "01-01-2024 14-00"). Timezone conversion happens automatically.\n\nOptional fields for create/update: location (address or venue), attendees (array of emails or objects with email/displayName), reminders (use "default" or array of reminder objects with minutes and method).\n\nFor updates: only provide the fields you want to change. All other fields will be preserved automatically.\n\nSupports recurring events via recurrence parameter - use RRULE string format or recurrence object with frequency (DAILY/WEEKLY/MONTHLY/YEARLY), count/until, interval, and optional byDay/byMonth/byMonthDay.\n\nFor updating recurring events: use updateAllInstances=true to update the entire series, or false/omit to update only the single instance.`,
			inputSchema: {
				action: z
					.enum(["create", "update", "delete"])
					.describe("Action to perform: create, update, or delete"),
				eventId: z
					.string()
					.optional()
					.describe("Event ID (required for update and delete operations)"),
				title: z
					.string()
					.optional()
					.describe("Event title/summary (required for create and update)"),
				startTime: z
					.string()
					.optional()
					.describe(
						'Start time in format "DD-MM-YYYY HH-MM" (e.g., "01-01-2024 14-00"). Required for create, optional for update.',
					),
				endTime: z
					.string()
					.optional()
					.describe(
						'End time in format "DD-MM-YYYY HH-MM", or duration like "1h", "90m". Defaults to 1 hour after start.',
					),
				timezone: z
					.string()
					.optional()
					.describe(
						"Override timezone (defaults to configured timezone). Use IANA timezone names like 'America/New_York'.",
					),
				description: z.string().optional().describe("Event description"),
				location: z
					.string()
					.optional()
					.describe("Event location (address or venue name)"),
				attendees: z
					.union([
						z.array(z.string()).describe("Array of attendee email addresses"),
						z
							.array(
								z.object({
									email: z.string().describe("Attendee email address"),
									displayName: z
										.string()
										.optional()
										.describe("Optional display name for the attendee"),
								}),
							)
							.describe(
								"Array of attendee objects with email and optional displayName",
							),
					])
					.optional()
					.describe(
						"Event attendees - can be array of email strings or objects with email/displayName",
					),
				reminders: z
					.union([
						z.literal("default").describe("Use default reminder settings"),
						z
							.array(
								z.object({
									minutes: z
										.number()
										.describe("Minutes before the event to send reminder"),
									method: z
										.enum(["email", "popup"])
										.optional()
										.default("popup")
										.describe(
											"Reminder method: 'email' or 'popup' (default: 'popup')",
										),
								}),
							)
							.describe("Array of custom reminders"),
					])
					.optional()
					.describe(
						"Event reminders - use 'default' for default settings, or array of reminder objects with minutes and optional method",
					),
				recurrence: z
					.union([
						z
							.string()
							.describe(
								"Recurrence rule as RRULE string (e.g., 'FREQ=DAILY;COUNT=10' or 'FREQ=WEEKLY;BYDAY=MO,WE,FR')",
							),
						z
							.object({
								frequency: z
									.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
									.describe("Recurrence frequency"),
								count: z.number().optional().describe("Number of occurrences"),
								until: z
									.string()
									.optional()
									.describe(
										'End date in format "DD-MM-YYYY" (mutually exclusive with count)',
									),
								interval: z
									.number()
									.optional()
									.describe("Interval between recurrences (default: 1)"),
								byDay: z
									.array(z.string())
									.optional()
									.describe(
										"Days of week for WEEKLY (e.g., ['MO', 'WE', 'FR']) or days for MONTHLY/YEARLY",
									),
								byMonth: z
									.array(z.number())
									.optional()
									.describe("Months for YEARLY (1-12)"),
								byMonthDay: z
									.array(z.number())
									.optional()
									.describe("Days of month for MONTHLY/YEARLY (1-31)"),
							})
							.describe("Recurrence rule object"),
					])
					.optional()
					.describe("Recurrence rule for repeating events"),
				updateAllInstances: z
					.boolean()
					.optional()
					.default(false)
					.describe(
						"For recurring events: update all instances (true) or just this instance (false). Default: false.",
					),
				sendUpdates: z
					.enum(["all", "externalOnly", "none"])
					.optional()
					.default("none")
					.describe(
						"Whether to send notifications about the event deletion. Defaults to 'none'.",
					),
				addMeetLink: z
					.boolean()
					.optional()
					.describe("Create a Google Meet link for this event"),
			},
		},
		async ({
			action,
			eventId,
			title,
			startTime,
			endTime,
			timezone,
			description,
			location,
			attendees,
			reminders,
			recurrence,
			updateAllInstances = false,
			sendUpdates = "none",
			addMeetLink,
		}) => {
			try {
				const tz = timezone || config.timezone;
				let response: {
					success: boolean;
					message: string;
					event?: Event;
					eventLink?: string;
					meetLink?: string;
					calendarLink?: string;
				};

				switch (action) {
					case "create": {
						if (!title || !startTime) {
							throw new Error(
								"Title and startTime are required for creating events",
							);
						}

						const result = await createEvent({
							title,
							description,
							startTime,
							endTime,
							timezone: tz,
							location,
							attendees,
							reminders,
							recurrence,
							addMeetLink,
						});

						response = {
							success: true,
							message: `Created calendar event: ${title}`,
							event: result.event,
							eventLink: result.htmlLink,
							meetLink: result.meetLink,
							calendarLink: generateCalendarLink(result.event),
						};
						break;
					}

					case "update": {
						if (!eventId) {
							throw new Error("eventId is required for updating events");
						}

						const result = await updateEvent({
							eventId,
							title,
							description,
							startTime,
							endTime,
							timezone: tz,
							location,
							attendees,
							reminders,
							recurrence,
							updateAllInstances,
							addMeetLink,
						});

						const eventSummary = result.event.summary || title || "event";
						const isRecurring =
							!!result.event.recurrence || !!result.event.recurringEventId;
						let updateMessage = `Updated calendar event: ${eventSummary}`;
						if (isRecurring) {
							if (updateAllInstances) {
								updateMessage = `Updated all instances of recurring event: ${eventSummary}`;
							} else if (result.event.recurringEventId) {
								updateMessage = `Updated single instance of recurring event: ${eventSummary}`;
							}
						}

						response = {
							success: true,
							message: updateMessage,
							event: result.event,
							eventLink: result.htmlLink,
							meetLink: result.meetLink,
							calendarLink: generateCalendarLink(result.event),
						};
						break;
					}

					case "delete": {
						if (!eventId) {
							throw new Error("eventId is required for deleting events");
						}

						const result = await deleteEvent({
							eventId,
							sendUpdates,
						});

						let deleteMessage = "Deleted calendar event";
						if (result.isRecurringMaster) {
							deleteMessage = "Deleted recurring event series (all instances)";
						} else if (result.isRecurring) {
							deleteMessage = "Deleted single instance of recurring event";
						}

						response = {
							success: true,
							message: deleteMessage,
						};
						break;
					}

					default:
						throw new Error(`Unknown action: ${action}`);
				}

				await log(
					"info",
					"manage_calendar_event",
					{ action, eventId, title, startTime, endTime, timezone: tz },
					response.message,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(response, null, 2),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log(
					"error",
					"manage_calendar_event",
					{ action, eventId, title, startTime, endTime, timezone },
					msg,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error managing calendar event: ${msg}`,
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
