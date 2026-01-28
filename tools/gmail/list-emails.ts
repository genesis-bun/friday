import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { listEmails } from "@/lib/utils/gmail.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerListEmails = (server: McpServer) => {
	server.registerTool(
		"list_emails",
		{
			description: `${config.systemPrompt}\n\nList Gmail messages. Returns up to 10 emails per page, newest first. Use pageToken from response to get next page. Supports Gmail search query syntax (e.g., "from:example@gmail.com", "is:unread", "subject:meeting").`,
			inputSchema: {
				query: z
					.string()
					.optional()
					.describe(
						"Gmail search query (e.g., 'from:example@gmail.com', 'is:unread', 'subject:meeting')",
					),
				maxResults: z
					.number()
					.optional()
					.default(10)
					.describe("Maximum number of results per page (default: 10, max: 10)"),
				pageToken: z
					.string()
					.optional()
					.describe("Token from previous response to get next page of results"),
			},
		},
		async ({ query, maxResults = 10, pageToken }) => {
			try {
				const result = await listEmails({
					query,
					maxResults: Math.min(maxResults, 10),
					pageToken,
				});

				const unreadCount = result.emails.filter((e) => e.unread).length;

				const response = {
					emails: result.emails,
					summary: {
						total: result.emails.length,
						unread: unreadCount,
					},
					query: query || "all",
					pagination: {
						nextPageToken: result.nextPageToken,
						hasMore: !!result.nextPageToken,
						resultSizeEstimate: result.resultSizeEstimate,
					},
				};

				await log(
					"info",
					"list_emails",
					{ query, maxResults, pageToken },
					`Listed ${result.emails.length} emails`,
				);

				return {
					content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "list_emails", { query, maxResults, pageToken }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error listing emails: ${msg}`,
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
