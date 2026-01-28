import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import {
	type Event,
	generateCalendarLink,
	getEvent,
} from "@/lib/utils/calendar.ts";
import { log } from "@/lib/utils/logger.ts";

type SharableEventMetadata = {
	title?: string;
	description?: string;
	descriptionPrefix?: string;
	descriptionSuffix?: string;
	location?: string;
	start?: { dateTime?: string; date?: string };
	end?: { dateTime?: string; date?: string };
	recurrence?: string | string[];
	meetLink?: string;
};

function mergeEventMetadata(
	event: Event,
	metadata?: SharableEventMetadata,
): Event {
	if (!metadata) return event;

	const merged: Event = { ...event };

	if (metadata.title !== undefined) {
		merged.summary = metadata.title;
	}

	if (metadata.location !== undefined) {
		merged.location = metadata.location;
	}

	if (metadata.start !== undefined) {
		merged.start = {
			...(event.start ?? {}),
			...metadata.start,
		};
	}

	if (metadata.end !== undefined) {
		merged.end = {
			...(event.end ?? {}),
			...metadata.end,
		};
	}

	if (metadata.recurrence !== undefined) {
		merged.recurrence = Array.isArray(metadata.recurrence)
			? metadata.recurrence
			: [metadata.recurrence];
	}

	const baseDescription =
		metadata.description !== undefined
			? metadata.description
			: event.description || "";
	const prefix = metadata.descriptionPrefix || "";
	const suffix = metadata.descriptionSuffix || "";
	const combinedDescription =
		`${prefix}${prefix && baseDescription ? "\n\n" : ""}${baseDescription}${suffix && (prefix || baseDescription) ? "\n\n" : ""}${suffix}`.trim();

	if (combinedDescription) {
		merged.description = combinedDescription;
	}

	// Allow explicitly setting a meet link even if the event has none.
	// `generateCalendarLink` extracts meet links from conferenceData.entryPoints.
	if (metadata.meetLink !== undefined) {
		merged.conferenceData = {
			...(event.conferenceData ?? {}),
			entryPoints: [
				{
					entryPointType: "video",
					uri: metadata.meetLink,
				},
			],
		} as Event["conferenceData"];
	}

	return merged;
}

export const registerCreateSharableLink = (server: McpServer) => {
	server.registerTool(
		"create_sharable_link",
		{
			description: `${config.systemPrompt}\n\nCreate a Google Calendar "Add to Calendar" link for an existing event.\n\nSupports optional custom metadata that is merged into the fetched event before generating the link. Use this to tailor the title/description/location/times for recipients without changing your original calendar event.`,
			inputSchema: {
				eventId: z
					.string()
					.describe(
						"Event ID from Google Calendar (can get from manage_event or list_events)",
					),
				metadata: z
					.object({
						title: z
							.string()
							.optional()
							.describe("Override the event title (maps to Google 'text')"),
						description: z
							.string()
							.optional()
							.describe(
								"Override the base event description (maps to Google 'details')",
							),
						descriptionPrefix: z
							.string()
							.optional()
							.describe("Prepends content to the description"),
						descriptionSuffix: z
							.string()
							.optional()
							.describe("Appends content to the description"),
						location: z
							.string()
							.optional()
							.describe("Override the event location"),
						start: z
							.object({
								dateTime: z
									.string()
									.optional()
									.describe("Override start dateTime (RFC3339)"),
								date: z
									.string()
									.optional()
									.describe(
										"Override start date for all-day events (YYYY-MM-DD)",
									),
							})
							.optional()
							.describe("Override the event start time/date"),
						end: z
							.object({
								dateTime: z
									.string()
									.optional()
									.describe("Override end dateTime (RFC3339)"),
								date: z
									.string()
									.optional()
									.describe(
										"Override end date for all-day events (YYYY-MM-DD)",
									),
							})
							.optional()
							.describe("Override the event end time/date"),
						recurrence: z
							.union([z.string(), z.array(z.string())])
							.optional()
							.describe(
								"Override recurrence (RRULE string or array). Example: 'RRULE:FREQ=WEEKLY;BYDAY=MO' or 'FREQ=WEEKLY;BYDAY=MO'",
							),
						meetLink: z
							.string()
							.optional()
							.describe(
								"Explicit Google Meet link to include in the generated link details",
							),
					})
					.optional()
					.describe(
						"Optional recipient-friendly overrides merged into the fetched event before generating the link",
					),
			},
		},
		async ({ eventId, metadata }) => {
			try {
				const event = await getEvent(eventId);
				const mergedEvent = mergeEventMetadata(event, metadata);
				const calendarLink = generateCalendarLink(mergedEvent);

				await log(
					"info",
					"create_sharable_link",
					{
						eventId,
						metadataKeys: metadata ? Object.keys(metadata) : [],
					},
					`Created sharable calendar link for event: ${mergedEvent.summary || event.summary || eventId}`,
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
									eventSummary: mergedEvent.summary ?? event.summary,
									appliedMetadata: metadata ?? null,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "create_sharable_link", { eventId }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error creating sharable calendar link: ${msg}`,
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
