import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { log } from "@/lib/utils/logger.ts";
import {
	addLinkToNote,
	deleteNote,
	generateNotePath,
	readNote,
	writeNote,
} from "@/lib/utils/notes.ts";
import { resolvePath } from "@/lib/utils/path.ts";

export const registerManageNote = (server: McpServer) => {
	server.registerTool(
		"manage_note",
		{
			description: `${config.systemPrompt}\n\nCreate, update, or delete a specific note. Before creating a new note, ALWAYS first check for the existence of related notes (using list_notes with similar keywords) and see if any common folder exists where the new note should be placed. Title parameter is mandatory and will be used to generate a readable filename if path is not provided. Reference notes for goals and ideas should live under Goals/{title}.md and Ideas/{title}.md and use Obsidian [[note-title]] syntax for linking.\n\nWhen updating an existing note, ALWAYS read the note first using readNote or view_note to see the current content before making any changes. NEVER replace the entire file content unless the user has explicitly asked for a full rewrite. Default behaviour must be to append new content or make minimal, surgical edits that preserve all existing text. The tool will automatically read the note before updating and return the previous content in the response for potential reversion.\n\nNote creation handles directory checking and creation if the provided path string includes subfolders. Echo the full path (absolute path) of the modified note in the response.`,
			inputSchema: {
				action: z
					.enum(["create", "update", "delete"])
					.optional()
					.default("create")
					.describe("Action to perform"),
				title: z
					.string()
					.describe("Note title (required, used to generate filename)"),
				path: z
					.string()
					.optional()
					.describe(
						"Relative path from vault root, including folder names if applicable (optional, generated from title if not provided). Example: 'Projects/MyNewProject/meeting.md'",
					),
				content: z
					.string()
					.optional()
					.describe("Markdown content (required for create and update)"),
				linkTo: z
					.string()
					.optional()
					.describe(
						"Path to existing note to link this note from (adds [[link]] to that note)",
					),
			},
		},
		async ({ action = "create", title, path, content, linkTo }) => {
			try {
				if (action === "delete") {
					if (!path) {
						throw new Error("Path is required for delete action");
					}
					let deletedContent: string | undefined;
					try {
						deletedContent = await readNote(path);
					} catch {}
					await deleteNote(path);
					const vaultPath = resolvePath(config.obsidianVault || "");
					const fullPath = `${vaultPath}/${path}`;

					await log(
						"info",
						"manage_note",
						{ action, path },
						`Deleted note: ${path}`,
					);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message: `Deleted note: ${path}`,
										path: fullPath,
										deletedContent,
									},
									null,
									2,
								),
							},
						],
					};
				}

				if (action === "create" || action === "update") {
					if (!content) {
						throw new Error(
							"Content is required for create and update actions",
						);
					}

					const notePath = path || (await generateNotePath(title));
					let oldContent: string | undefined;
					if (action === "update") {
						try {
							oldContent = await readNote(notePath);
						} catch {}
					}
					await writeNote(notePath, content);

					if (action === "create" && linkTo) {
						await addLinkToNote(linkTo, notePath);
					}

					const message =
						action === "create"
							? `Created note: ${notePath}`
							: `Updated note: ${notePath}`;

					await log("info", "manage_note", { action, path: notePath }, message);

					const vaultPath = resolvePath(config.obsidianVault || "");
					const fullPath = `${vaultPath}/${notePath}`;

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message,
										path: fullPath,
										...(oldContent !== undefined && { oldContent }),
									},
									null,
									2,
								),
							},
						],
					};
				}

				throw new Error(`Unknown action: ${action}`);
			} catch (error) {
				const errorMsg = `Failed to ${action} note: ${String(error)}`;
				await log("error", "manage_note", { action, path }, errorMsg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ success: false, error: errorMsg },
								null,
								2,
							),
						},
					],
				};
			}
		},
	);
};
