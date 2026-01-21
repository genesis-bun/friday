import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { listDocuments } from "@/lib/utils/docs.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerListDocuments = (server: McpServer) => {
	server.registerTool(
		"list_documents",
		{
			description: `${config.systemPrompt}\n\nList Google Docs documents. Returns metadata including ID, title, created/modified dates, and web link.`,
			inputSchema: {
				query: z
					.string()
					.optional()
					.describe(
						"Search query string to filter documents by name (e.g., 'Meeting')",
					),
				maxResults: z
					.number()
					.optional()
					.default(50)
					.describe("Maximum number of results to return (default: 50)"),
			},
		},
		async ({ query, maxResults = 50 }) => {
			try {
				const documents = await listDocuments({ query, maxResults });

				await log(
					"info",
					"list_documents",
					{ query, maxResults },
					`Listed ${documents.length} documents`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									count: documents.length,
									documents,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "list_documents", { query, maxResults }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error listing documents: ${msg}`,
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
