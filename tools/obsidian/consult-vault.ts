import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { findSimilarNotes } from "@/lib/semantic.ts";
import { log } from "@/lib/utils/logger.ts";
import { readNote } from "@/lib/utils/notes.ts";
import { resolvePath } from "@/lib/utils/path.ts";

export const registerConsultVault = (server: McpServer) => {
	server.registerTool(
		"consult_vault",
		{
			description: `${config.systemPrompt}\n\nFind semantically related notes in your vault using vector embeddings. Returns top similar notes with similarity scores for backlink suggestions.`,
			inputSchema: {
				query: z
					.string()
					.describe("Query text to find semantically similar notes"),
				limit: z
					.number()
					.optional()
					.default(5)
					.describe("Maximum number of similar notes to return"),
				folder: z
					.string()
					.optional()
					.describe(
						"Optional folder to search within (relative to vault root)",
					),
			},
		},
		async ({ query, limit = 5, folder }) => {
			try {
				if (!config.obsidianVault) {
					throw new Error("Obsidian vault path not configured");
				}

				const vaultRoot = resolvePath(config.obsidianVault);
				const searchPath = folder ? join(vaultRoot, folder) : vaultRoot;

				if (!searchPath.startsWith(vaultRoot)) {
					throw new Error("Folder path must be within the obsidian vault");
				}

				await Bun.$`mkdir -p ${searchPath}`.quiet();

				const allFiles = await readdir(searchPath, { recursive: true });
				const noteFiles = allFiles.filter((f) => f.endsWith(".md"));

				const notesWithContent = await Promise.all(
					noteFiles.map(async (relativePath) => {
						try {
							const fullPath = join(searchPath, relativePath);
							const vaultRelativePath = folder
								? join(folder, relativePath)
								: relativePath;
							const content = await readNote(vaultRelativePath);
							const stats = await stat(fullPath);
							return {
								path: vaultRelativePath,
								content,
								mtime: stats.mtimeMs,
							};
						} catch {
							return null;
						}
					}),
				);

				const validNotes = notesWithContent.filter(
					(n): n is { path: string; content: string; mtime: number } =>
						n !== null,
				);

				const similarNotes = await findSimilarNotes(query, validNotes, limit);

				await log(
					"info",
					"consult_vault",
					{ query, limit, folder },
					`Found ${similarNotes.length} similar notes`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									query,
									count: similarNotes.length,
									notes: similarNotes,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const errorMsg = `Failed to consult vault: ${String(error)}`;
				await log("error", "consult_vault", { query, limit, folder }, errorMsg);
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
