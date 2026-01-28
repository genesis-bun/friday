import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { getEmail } from "@/lib/utils/gmail.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerGetEmail = (server: McpServer) => {
	server.registerTool(
		"get_email",
		{
			description: `${config.systemPrompt}\n\nRetrieve full email content by message ID. Returns headers, body, attachment metadata (not full files), and labels.`,
			inputSchema: {
				messageId: z
					.string()
					.describe("Gmail message ID (can extract from list_emails response)"),
			},
		},
		async ({ messageId }) => {
			try {
				const email = await getEmail(messageId);

				await log(
					"info",
					"get_email",
					{ messageId },
					`Retrieved email: ${email.headers.subject || messageId}`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									...email,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "get_email", { messageId }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error getting email: ${msg}`,
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
