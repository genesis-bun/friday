import { type calendar_v3, google } from "googleapis";
import { config } from "@/config.ts";
import {
	convertToGoogleCalendarFormat,
	parseDuration,
	parseLocalTime,
	validateEventTimes,
	validateNotInPast,
} from "./datetime.ts";
import { getAuthenticatedClient } from "./google-auth.ts";

export async function getCalendarClient() {
	return google.calendar({
		version: "v3",
		auth: await getAuthenticatedClient(),
	});
}

export interface RecurrenceRule {
	frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
	count?: number;
	until?: string;
	interval?: number;
	byDay?: string[];
	byMonth?: number[];
	byMonthDay?: number[];
}

export interface AttendeeInput {
	email: string;
	displayName?: string;
}

export interface ReminderInput {
	minutes: number;
	method?: "email" | "popup";
}

export interface CreateEventParams {
	title: string;
	description?: string;
	startTime: string;
	endTime?: string;
	timezone?: string;
	recurrence?: RecurrenceRule | string;
	addMeetLink?: boolean;
	location?: string;
	attendees?: string[] | AttendeeInput[];
	reminders?: ReminderInput[] | "default";
}

export interface CreateEventResult {
	id?: string;
	htmlLink?: string;
	meetLink?: string;
	event: calendar_v3.Schema$Event;
}

function formatRecurrenceRule(recurrence: RecurrenceRule | string): string[] {
	if (typeof recurrence === "string") {
		return [`RRULE:${recurrence}`];
	}

	const parts: string[] = [];
	parts.push(`FREQ=${recurrence.frequency}`);

	if (recurrence.interval) {
		parts.push(`INTERVAL=${recurrence.interval}`);
	}

	if (recurrence.count) {
		parts.push(`COUNT=${recurrence.count}`);
	} else if (recurrence.until) {
		const untilDate = new Date(recurrence.until);
		parts.push(
			`UNTIL=${untilDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
		);
	}

	if (recurrence.byDay && recurrence.byDay.length > 0) {
		parts.push(`BYDAY=${recurrence.byDay.join(",")}`);
	}

	if (recurrence.byMonth && recurrence.byMonth.length > 0) {
		parts.push(`BYMONTH=${recurrence.byMonth.join(",")}`);
	}

	if (recurrence.byMonthDay && recurrence.byMonthDay.length > 0) {
		parts.push(`BYMONTHDAY=${recurrence.byMonthDay.join(",")}`);
	}

	return [`RRULE:${parts.join(";")}`];
}

export async function createEvent(
	params: CreateEventParams,
): Promise<CreateEventResult> {
	const tz = params.timezone || config.timezone;
	const startDate = parseLocalTime(params.startTime, tz);
	validateNotInPast(startDate);

	let endDate: Date;
	if (params.endTime) {
		try {
			const durationMinutes = parseDuration(params.endTime);
			endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
		} catch {
			endDate = parseLocalTime(params.endTime, tz);
		}
	} else {
		endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
	}

	validateEventTimes(startDate, endDate);

	const requestBody: calendar_v3.Schema$Event = {
		summary: params.title,
		description: params.description || "",
		start: convertToGoogleCalendarFormat(startDate, tz),
		end: convertToGoogleCalendarFormat(endDate, tz),
	};

	if (params.location) {
		requestBody.location = params.location;
	}

	if (params.attendees) {
		requestBody.attendees = params.attendees.map((attendee) => {
			if (typeof attendee === "string") {
				return { email: attendee };
			}
			return {
				email: attendee.email,
				displayName: attendee.displayName,
			};
		});
	}

	if (params.reminders !== undefined) {
		if (params.reminders === "default") {
			requestBody.reminders = { useDefault: true };
		} else if (Array.isArray(params.reminders)) {
			requestBody.reminders = {
				useDefault: false,
				overrides: params.reminders.map((reminder) => ({
					method: reminder.method || "popup",
					minutes: reminder.minutes,
				})),
			};
		}
	}

	if (params.recurrence) {
		requestBody.recurrence = formatRecurrenceRule(params.recurrence);
	}

	if (params.addMeetLink) {
		requestBody.conferenceData = {
			createRequest: {
				conferenceSolutionKey: { type: "hangoutsMeet" },
				requestId: crypto.randomUUID(),
			},
		};
	}

	const calendar = await getCalendarClient();
	const event = await calendar.events.insert({
		calendarId: "primary",
		requestBody,
		conferenceDataVersion: params.addMeetLink ? 1 : undefined,
	});

	const meetLink =
		event.data.conferenceData?.entryPoints?.find(
			(ep) => ep.entryPointType === "video",
		)?.uri || undefined;

	return {
		id: event.data.id || undefined,
		htmlLink: event.data.htmlLink || undefined,
		meetLink,
		event: event.data,
	};
}

export async function getEvent(
	eventId: string,
): Promise<calendar_v3.Schema$Event> {
	const calendar = await getCalendarClient();
	const event = await calendar.events.get({
		calendarId: "primary",
		eventId,
	});
	return event.data;
}

export interface UpdateEventParams {
	eventId: string;
	title?: string;
	description?: string;
	startTime?: string;
	endTime?: string;
	timezone?: string;
	recurrence?: RecurrenceRule | string;
	updateAllInstances?: boolean;
	addMeetLink?: boolean;
	location?: string;
	attendees?: string[] | AttendeeInput[];
	reminders?: ReminderInput[] | "default";
}

export async function updateEvent(
	params: UpdateEventParams,
): Promise<CreateEventResult> {
	const calendar = await getCalendarClient();
	const tz = params.timezone || config.timezone;

	const existingEvent = await calendar.events.get({
		calendarId: "primary",
		eventId: params.eventId,
	});

	const isRecurringInstance = !!existingEvent.data.recurringEventId;

	let targetEventId = params.eventId;

	if (isRecurringInstance && params.updateAllInstances) {
		targetEventId = existingEvent.data.recurringEventId || params.eventId;
		const masterEvent = await calendar.events.get({
			calendarId: "primary",
			eventId: targetEventId,
		});
		existingEvent.data = masterEvent.data;
	}

	// Start with existing event data to preserve all fields
	const updateData: calendar_v3.Schema$Event = {
		...existingEvent.data,
	};

	// Only update fields that are explicitly provided
	if (params.title !== undefined) {
		updateData.summary = params.title;
	}

	if (params.description !== undefined) {
		updateData.description = params.description;
	}

	if (params.location !== undefined) {
		updateData.location = params.location;
	}

	if (params.attendees !== undefined) {
		updateData.attendees = params.attendees.map((attendee) => {
			if (typeof attendee === "string") {
				return { email: attendee };
			}
			return {
				email: attendee.email,
				displayName: attendee.displayName,
			};
		});
	}

	if (params.reminders !== undefined) {
		if (params.reminders === "default") {
			updateData.reminders = { useDefault: true };
		} else if (Array.isArray(params.reminders)) {
			updateData.reminders = {
				useDefault: false,
				overrides: params.reminders.map((reminder) => ({
					method: reminder.method || "popup",
					minutes: reminder.minutes,
				})),
			};
		}
	}

	if (params.recurrence !== undefined) {
		if (isRecurringInstance && !params.updateAllInstances) {
			throw new Error(
				"Cannot change recurrence on a single instance. Use updateAllInstances=true to update the series.",
			);
		}
		if (
			existingEvent.data.recurrence &&
			!params.updateAllInstances &&
			!isRecurringInstance
		) {
			throw new Error(
				"Cannot change recurrence on a recurring event master. Use updateAllInstances=true.",
			);
		}
		updateData.recurrence = formatRecurrenceRule(params.recurrence);
	}

	let startDate: Date | undefined;
	let endDate: Date | undefined;

	if (params.startTime) {
		startDate = parseLocalTime(params.startTime, tz);
		if (!isRecurringInstance || params.updateAllInstances) {
			validateNotInPast(startDate);
		}
		updateData.start = convertToGoogleCalendarFormat(startDate, tz);
	} else {
		// Preserve existing start time
		startDate = existingEvent.data.start?.dateTime
			? new Date(existingEvent.data.start.dateTime)
			: undefined;
	}

	if (params.endTime) {
		if (startDate) {
			try {
				const durationMinutes = parseDuration(params.endTime);
				endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
			} catch {
				endDate = parseLocalTime(params.endTime, tz);
			}
		} else {
			endDate = parseLocalTime(params.endTime, tz);
		}
		updateData.end = convertToGoogleCalendarFormat(endDate, tz);
	} else {
		// Preserve existing end time
		endDate = existingEvent.data.end?.dateTime
			? new Date(existingEvent.data.end.dateTime)
			: undefined;
	}

	if (startDate && endDate) {
		validateEventTimes(startDate, endDate);
	}

	// Handle meet link addition
	if (params.addMeetLink) {
		updateData.conferenceData = {
			createRequest: {
				conferenceSolutionKey: { type: "hangoutsMeet" },
				requestId: crypto.randomUUID(),
			},
		};
	}

	const event = await calendar.events.update({
		calendarId: "primary",
		eventId: targetEventId,
		requestBody: updateData,
		conferenceDataVersion: params.addMeetLink ? 1 : undefined,
	});

	const meetLink =
		event.data.conferenceData?.entryPoints?.find(
			(ep) => ep.entryPointType === "video",
		)?.uri || undefined;

	return {
		id: event.data.id || undefined,
		htmlLink: event.data.htmlLink || undefined,
		meetLink,
		event: event.data,
	};
}

export interface DeleteEventParams {
	eventId: string;
	sendUpdates?: "all" | "externalOnly" | "none";
}

export interface DeleteEventResult {
	isRecurring: boolean;
	isRecurringMaster: boolean;
}

export async function deleteEvent(
	params: DeleteEventParams,
): Promise<DeleteEventResult> {
	const calendar = await getCalendarClient();

	const existingEvent = await calendar.events.get({
		calendarId: "primary",
		eventId: params.eventId,
	});

	const isRecurring = !!existingEvent.data.recurringEventId;
	const isRecurringMaster = !!existingEvent.data.recurrence;

	await calendar.events.delete({
		calendarId: "primary",
		eventId: params.eventId,
		sendUpdates: params.sendUpdates || "none",
	});

	return { isRecurring, isRecurringMaster };
}

export interface ListEventsParams {
	days?: number;
	maxResults?: number;
	includeRecurringMasters?: boolean;
}

export interface EventWithRecurrenceInfo extends calendar_v3.Schema$Event {
	_isRecurringMaster?: boolean;
	_isRecurringInstance?: boolean;
	_recurringEventId?: string;
}

export async function listEvents(
	params: ListEventsParams = {},
): Promise<EventWithRecurrenceInfo[]> {
	const calendar = await getCalendarClient();
	const days = params.days ?? 30;
	const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();

	const response = await calendar.events.list({
		calendarId: "primary",
		timeMin: new Date().toISOString(),
		timeMax,
		singleEvents: true,
		orderBy: "startTime",
		maxResults: params.maxResults ?? 50,
	});

	const events = (response.data.items || []) as EventWithRecurrenceInfo[];

	return events.map((event) => {
		const isRecurringMaster = !!event.recurrence && event.recurrence.length > 0;
		const isRecurringInstance = !!event.recurringEventId;

		return {
			...event,
			_isRecurringMaster: isRecurringMaster,
			_isRecurringInstance: isRecurringInstance,
			_recurringEventId: event.recurringEventId || undefined,
		};
	});
}

export async function getRecurringEventInstances(
	recurringEventId: string,
	params: ListEventsParams = {},
): Promise<EventWithRecurrenceInfo[]> {
	const calendar = await getCalendarClient();
	const days = params.days ?? 30;
	const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();

	const response = await calendar.events.instances({
		calendarId: "primary",
		eventId: recurringEventId,
		timeMin: new Date().toISOString(),
		timeMax,
		maxResults: params.maxResults ?? 250,
	});

	const events = (response.data.items || []) as EventWithRecurrenceInfo[];

	return events.map((event) => ({
		...event,
		_isRecurringMaster: false,
		_isRecurringInstance: true,
		_recurringEventId: recurringEventId,
	}));
}

export type Event = calendar_v3.Schema$Event;

function formatDateToRFC5545(dateTime: string): string {
	const date = new Date(dateTime);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");
	return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

export function generateCalendarLink(event: calendar_v3.Schema$Event): string {
	const baseUrl = "https://calendar.google.com/calendar/u/0/r/eventedit";
	const params = new URLSearchParams();

	if (event.summary) {
		params.append("text", event.summary);
	}

	if (event.start?.dateTime) {
		const startDate = formatDateToRFC5545(event.start.dateTime);
		const endDate = event.end?.dateTime
			? formatDateToRFC5545(event.end.dateTime)
			: startDate;
		params.append("dates", `${startDate}/${endDate}`);
	} else if (event.start?.date && event.end?.date) {
		params.append("dates", `${event.start.date}/${event.end.date}`);
	}

	if (event.location) {
		params.append("location", event.location);
	}

	// Extract Google Meet link using the same pattern as createEvent/updateEvent
	const meetLink =
		event.conferenceData?.entryPoints?.find(
			(ep) => ep.entryPointType === "video",
		)?.uri || undefined;

	// Build description with meet link if available
	let description = event.description || "";
	if (meetLink) {
		const meetLinkText = `\n\nGoogle Meet: ${meetLink}`;
		description = description
			? `${description}${meetLinkText}`
			: meetLinkText.trim();
	}

	if (description) {
		params.append("details", description);
	}

	if (event.recurrence && event.recurrence.length > 0) {
		const rrule = event.recurrence[0];
		if (rrule) {
			if (rrule.startsWith("RRULE:")) {
				params.append("recur", rrule.substring(6));
			} else {
				params.append("recur", rrule);
			}
		}
	}

	return `${baseUrl}?${params.toString()}`;
}
