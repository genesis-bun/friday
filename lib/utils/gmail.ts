import { type gmail_v1, google } from "googleapis";
import { getAuthenticatedClient } from "./google-auth.ts";

export async function getGmailClient() {
	return google.gmail({
		version: "v1",
		auth: await getAuthenticatedClient(),
	});
}

export interface SendEmailParams {
	to: string;
	subject: string;
	body: string;
	cc?: string;
	bcc?: string;
	replyTo?: string;
	isHtml?: boolean;
}

export interface SendEmailResult {
	messageId: string;
	threadId?: string;
}

export async function sendEmail(
	params: SendEmailParams,
): Promise<SendEmailResult> {
	const gmail = await getGmailClient();
	const userEmail = (await gmail.users.getProfile({ userId: "me" })).data
		.emailAddress;

	if (!userEmail) {
		throw new Error("Could not determine user email address");
	}

	const lines: string[] = [];
	lines.push(`From: ${userEmail}`);
	lines.push(`To: ${params.to}`);

	if (params.cc) lines.push(`Cc: ${params.cc}`);
	if (params.bcc) lines.push(`Bcc: ${params.bcc}`);
	if (params.replyTo) lines.push(`Reply-To: ${params.replyTo}`);

	lines.push(`Subject: ${params.subject}`);

	if (params.isHtml) {
		lines.push("Content-Type: text/html; charset=utf-8");
	} else {
		lines.push("Content-Type: text/plain; charset=utf-8");
	}

	lines.push("");
	lines.push(params.body);

	const raw = Buffer.from(lines.join("\r\n"))
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	const response = await gmail.users.messages.send({
		userId: "me",
		requestBody: {
			raw,
		},
	});

	return {
		messageId: response.data.id || "",
		threadId: response.data.threadId || undefined,
	};
}

export interface ListEmailsParams {
	query?: string;
	maxResults?: number;
	pageToken?: string;
}

export interface EmailListItem {
	id: string;
	threadId: string;
	subject: string;
	from: string;
	to: string[];
	date: string;
	snippet: string;
	labels?: string[];
	unread?: boolean;
}

export interface ListEmailsResult {
	emails: EmailListItem[];
	nextPageToken?: string;
	resultSizeEstimate?: number;
}

export async function listEmails(
	params: ListEmailsParams = {},
): Promise<ListEmailsResult> {
	const gmail = await getGmailClient();
	const maxResults = Math.min(params.maxResults || 10, 10);

	const response = await gmail.users.messages.list({
		userId: "me",
		q: params.query,
		maxResults,
		pageToken: params.pageToken,
	});

	const messageIds = (response.data.messages || []).map((m) => m.id || "");

	const messages = await Promise.all(
		messageIds.map((id) =>
			gmail.users.messages.get({
				userId: "me",
				id,
				format: "metadata",
				metadataHeaders: ["From", "To", "Subject", "Date"],
			}),
		),
	);

	const emails: EmailListItem[] = messages.map((msg) => {
		const message = msg.data;
		const headers = message.payload?.headers || [];
		const getHeader = (name: string) =>
			headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
				?.value || "";

		const simplified: EmailListItem = {
			id: message.id || "",
			threadId: message.threadId || "",
			subject: getHeader("Subject"),
			from: getHeader("From"),
			to: getHeader("To")
				.split(",")
				.map((e) => e.trim())
				.filter(Boolean),
			date: getHeader("Date"),
			snippet: message.snippet || "",
		};

		if (message.labelIds && message.labelIds.length > 0) {
			simplified.labels = message.labelIds;
		}

		if (message.labelIds?.includes("UNREAD")) {
			simplified.unread = true;
		}

		return simplified;
	});

	return {
		emails,
		nextPageToken: response.data.nextPageToken || undefined,
		resultSizeEstimate: response.data.resultSizeEstimate || undefined,
	};
}

export interface CompressedEmail {
	messageId: string;
	threadId: string;
	headers: {
		from: string;
		to: string[];
		cc?: string[];
		bcc?: string[];
		subject: string;
		date: string;
	};
	body: string;
	attachments: Array<{
		filename: string;
		size: number;
		mimeType: string;
		attachmentId: string;
	}>;
	labels: string[];
	snippet: string;
}

export async function getEmail(messageId: string): Promise<CompressedEmail> {
	const gmail = await getGmailClient();
	const response = await gmail.users.messages.get({
		userId: "me",
		id: messageId,
		format: "full",
	});

	const message = response.data;
	const headers = message.payload?.headers || [];
	const getHeader = (name: string) =>
		headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
			?.value || "";

	const getBody = (part: gmail_v1.Schema$MessagePart): string => {
		if (part.body?.data) {
			return Buffer.from(part.body.data, "base64").toString("utf-8");
		}
		if (part.parts) {
			return part.parts.map(getBody).join("\n\n");
		}
		return "";
	};

	let body = "";
	if (message.payload?.body?.data) {
		body = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
	} else if (message.payload?.parts) {
		const textPart = message.payload.parts.find(
			(p) => p.mimeType === "text/plain",
		);
		const htmlPart = message.payload.parts.find(
			(p) => p.mimeType === "text/html",
		);

		if (textPart) {
			body = getBody(textPart);
		} else if (htmlPart) {
			body = getBody(htmlPart);
		}
	}

	const attachments: CompressedEmail["attachments"] = [];
	const extractAttachments = (part: gmail_v1.Schema$MessagePart) => {
		if (part.filename && part.body?.attachmentId) {
			attachments.push({
				filename: part.filename,
				size: part.body.size || 0,
				mimeType: part.mimeType || "",
				attachmentId: part.body.attachmentId,
			});
		}
		if (part.parts) {
			part.parts.forEach(extractAttachments);
		}
	};

	if (message.payload?.parts) {
		message.payload.parts.forEach(extractAttachments);
	}

	const toHeader = getHeader("To");
	const ccHeader = getHeader("Cc");
	const bccHeader = getHeader("Bcc");

	return {
		messageId: message.id || "",
		threadId: message.threadId || "",
		headers: {
			from: getHeader("From"),
			to: toHeader.split(",").map((e) => e.trim()).filter(Boolean),
			cc: ccHeader ? ccHeader.split(",").map((e) => e.trim()).filter(Boolean) : undefined,
			bcc: bccHeader ? bccHeader.split(",").map((e) => e.trim()).filter(Boolean) : undefined,
			subject: getHeader("Subject"),
			date: getHeader("Date"),
		},
		body,
		attachments,
		labels: message.labelIds || [],
		snippet: message.snippet || "",
	};
}
