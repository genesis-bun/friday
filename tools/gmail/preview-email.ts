import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { formatEmailPreview, getGmailClient } from "@/lib/utils/gmail.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerPreviewEmail = (server: McpServer) => {
	server.registerTool(
		"preview_email",
		{
			description: `${config.systemPrompt}\n\nPreview an email BEFORE sending.\n\n**REQUIRED OUTPUT:** After calling this tool, ALWAYS display the email exactly as an end user would experience it.\n- Always show headers (From, To, CC, BCC, Reply-To if present, Subject) and clearly indicate Content-Type.\n- If the email is plain text: display it as plain text (preserve paragraphs/line breaks).\n- If the email is HTML: display a readable “rendered” preview of the HTML content (what the recipient would see), and also include the plain-text equivalent/fallback if available.\n\n**REQUIRED WORKFLOW:** Use this tool before any send. Present the preview, then ask for explicit user confirmation (send / do not send / edits) before calling send_email.`,
			inputSchema: {
				to: z
					.string()
					.max(254)
					.refine(
						(val) => {
							const emails = val.split(",").map((e) => e.trim());
							return emails.every(
								(email) =>
									email.length > 0 &&
									email.length <= 254 &&
									/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
							);
						},
						{ message: "Invalid email address format" },
					)
					.transform((val) => val.replace(/[\r\n]/g, "").trim())
					.describe(
						"Recipient email address(es), comma-separated for multiple",
					),
				subject: z
					.string()
					.max(998)
					.transform((val) => val.replace(/[\r\n]/g, "").trim())
					.describe("Email subject"),
				body: z.string().describe("Email body content (plain text or HTML)"),
				cc: z
					.string()
					.max(254)
					.refine(
						(val) => {
							const emails = val.split(",").map((e) => e.trim());
							return emails.every(
								(email) =>
									email.length > 0 &&
									email.length <= 254 &&
									/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
							);
						},
						{ message: "Invalid email address format" },
					)
					.transform((val) => val.replace(/[\r\n]/g, "").trim())
					.optional()
					.describe("CC recipients, comma-separated"),
				bcc: z
					.string()
					.max(254)
					.refine(
						(val) => {
							const emails = val.split(",").map((e) => e.trim());
							return emails.every(
								(email) =>
									email.length > 0 &&
									email.length <= 254 &&
									/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
							);
						},
						{ message: "Invalid email address format" },
					)
					.transform((val) => val.replace(/[\r\n]/g, "").trim())
					.optional()
					.describe("BCC recipients, comma-separated"),
				isHtml: z
					.boolean()
					.optional()
					.default(false)
					.describe("Whether body is HTML (default: false)"),
			},
		},
		async ({ to, subject, body, cc, bcc, isHtml = false }) => {
			try {
				const gmail = await getGmailClient();
				const userEmail = (await gmail.users.getProfile({ userId: "me" })).data
					.emailAddress;

				if (!userEmail) {
					throw new Error("Could not determine user email address");
				}

				const preview = formatEmailPreview(
					{ to, subject, body, cc, bcc, isHtml },
					userEmail,
				);

				await log(
					"info",
					"preview_email",
					{ to, subject },
					"Email preview generated",
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									preview,
									message:
										"Display the email as the recipient would see it. Show headers (From/To/CC/BCC/Reply-To/Subject) and content type. For plain text, preserve line breaks. For HTML, show a readable rendered preview and also include a plain-text equivalent/fallback if available. Then request explicit user confirmation before sending.",
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "preview_email", { to, subject }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error generating email preview: ${msg}`,
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
