import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { compressDocument, getDocument } from "@/lib/utils/docs.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerGetDocument = (server: McpServer) => {
	server.registerTool(
		"get_document",
		{
			description: `${config.systemPrompt}\n\nRetrieve the full content and structure of a Google Docs document. Accepts document ID or full Google Docs URL.`,
			inputSchema: {
				documentId: z
					.string()
					.describe(
						"Document ID or full Google Docs URL (e.g., 'https://docs.google.com/document/d/DOCUMENT_ID/edit')",
					),
			},
		},
		async ({ documentId }) => {
			try {
				const document = await getDocument(documentId);
				const compressed = compressDocument(document);

				await log(
					"info",
					"get_document",
					{ documentId },
					`Retrieved document: ${document.title || documentId}`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									documentId: compressed.documentId,
									title: compressed.title,
									revisionId: compressed.revisionId,
									content: compressed.content,
									structure: compressed.structure,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log("error", "get_document", { documentId }, msg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error getting document: ${msg}`,
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
