import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { sendEmail } from "@/lib/utils/gmail.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerSendEmail = (server: McpServer) => {
	server.registerTool(
		"send_email",
		{
			description: `${config.systemPrompt}\n\nSend an email via Gmail. Supports plain text and HTML. Multiple recipients can be comma-separated.`,
			inputSchema: {
				to: z.string().describe("Recipient email address(es), comma-separated for multiple"),
				subject: z.string().describe("Email subject"),
				body: z.string().describe("Email body content (plain text or HTML)"),
				cc: z.string().optional().describe("CC recipients, comma-separated"),
				bcc: z.string().optional().describe("BCC recipients, comma-separated"),
				isHtml: z.boolean().optional().default(false).describe("Whether body is HTML (default: false)"),
			},
		},
		async ({ to, subject, body, cc, bcc, isHtml = false }) => {
			try {
				const result = await sendEmail({
					to,
					subject,
					body,
					cc,
					bcc,
					isHtml,
				});

				const response = {
					success: true,
					messageId: result.messageId,
					threadId: result.threadId,
					message: `Sent email to ${to}`,
				};

				await log("info", "send_email", { to, subject }, response.message);

				return {
					content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "send_email", { to, subject }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error sending email: ${msg}`,
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
