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

export interface CreateEventParams {
	title: string;
	description?: string;
	startTime: string;
	endTime?: string;
	timezone?: string;
	recurrence?: RecurrenceRule | string;
	addMeetLink?: boolean;
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

	const updateData: {
		summary?: string;
		description?: string;
		start?: { dateTime: string; timeZone: string };
		end?: { dateTime: string; timeZone: string };
		recurrence?: string[];
		conferenceData?: calendar_v3.Schema$ConferenceData;
	} = {};

	if (params.title !== undefined) updateData.summary = params.title;
	if (params.description !== undefined)
		updateData.description = params.description;
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
	} else if (existingEvent.data.start?.dateTime) {
		startDate = new Date(existingEvent.data.start.dateTime);
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
	} else if (existingEvent.data.end?.dateTime) {
		endDate = new Date(existingEvent.data.end.dateTime);
	}

	if (startDate && endDate) {
		validateEventTimes(startDate, endDate);
	}

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
