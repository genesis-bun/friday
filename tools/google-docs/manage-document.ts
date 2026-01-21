import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { docs_v1 } from "googleapis";
import { z } from "zod";
import { config } from "@/config.ts";
import {
	createDocument,
	deleteDocument,
	updateDocument,
} from "@/lib/utils/docs.ts";
import { log } from "@/lib/utils/logger.ts";

export const registerManageDocument = (server: McpServer) => {
	server.registerTool(
		"manage_document",
		{
			description: `${config.systemPrompt}\n\nCreate, update, or delete Google Docs documents. For update action, provide an array of request objects following Google Docs API batchUpdate format (insertText, replaceAllText, updateTextStyle, etc.). Accepts document ID or full Google Docs URL.`,
			inputSchema: {
				action: z
					.enum(["create", "update", "delete"])
					.optional()
					.default("create")
					.describe("Action to perform"),
				documentId: z
					.string()
					.optional()
					.describe(
						"Document ID or URL (required for update and delete actions)",
					),
				title: z
					.string()
					.optional()
					.describe(
						"Document title (required for create, optional for update)",
					),
				requests: z
					.array(z.any())
					.optional()
					.describe(
						"Array of batch update request objects (required for update action). Supports insertText, replaceAllText, updateTextStyle, createParagraphBullets, insertTable, deleteTableRow, etc.",
					),
			},
		},
		async ({ action = "create", documentId, title, requests }) => {
			try {
				let response: {
					success: boolean;
					message: string;
					documentId?: string;
					documentLink?: string;
				};

				switch (action) {
					case "create": {
						if (!title) {
							throw new Error("Title is required for creating documents");
						}

						const result = await createDocument(title);
						response = {
							success: true,
							message: `Created document: ${title}`,
							documentId: result.documentId,
							documentLink: result.documentLink,
						};
						break;
					}

					case "update": {
						if (!documentId) {
							throw new Error("documentId is required for updating documents");
						}
						if (!requests || requests.length === 0) {
							throw new Error(
								"Requests array is required and cannot be empty for updating documents",
							);
						}

						const result = await updateDocument({
							documentId,
							requests: requests as unknown as docs_v1.Schema$Request[],
						});
						response = {
							success: true,
							message: `Updated document`,
							documentId: result.documentId,
						};
						break;
					}

					case "delete": {
						if (!documentId) {
							throw new Error("documentId is required for deleting documents");
						}

						await deleteDocument(documentId);
						response = {
							success: true,
							message: "Deleted document",
						};
						break;
					}

					default:
						throw new Error(`Unknown action: ${action}`);
				}

				await log(
					"info",
					"manage_document",
					{ action, documentId, title },
					response.message,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(response, null, 2),
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await log(
					"error",
					"manage_document",
					{ action, documentId, title },
					msg,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: false,
									error: `Error managing document: ${msg}`,
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
