import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { log } from "@/lib/utils/logger.ts";
import { resolvePath, resolveVaultPath } from "@/lib/utils/path.ts";

export const registerListNotes = (server: McpServer) => {
	server.registerTool(
		"list_notes",
		{
			description: `${config.systemPrompt}\n\nQuery notes and return metadata (paths and frontmatter). Does not return note content. Supports filtering by keywords in filenames and can return directories only.`,
			inputSchema: {
				keywords: z
					.array(z.string())
					.optional()
					.describe(
						"Keywords to filter filenames (returns all if empty or omitted). Matches if any keyword is present in the filename.",
					),
				folder: z
					.string()
					.optional()
					.describe(
						"Optional subfolder within the vault to list notes from (relative to vault root).",
					),
				dirOnly: z
					.boolean()
					.optional()
					.describe("If true, only returns directories within the vault."),
			},
		},
		async ({ keywords = [], folder = "", dirOnly = false }) => {
			try {
				if (!config.obsidianVault) {
					throw new Error("Obsidian vault path not configured");
				}

				const vaultRoot = resolvePath(config.obsidianVault);
				const searchPath = folder
					? resolveVaultPath(folder, vaultRoot)
					: vaultRoot;

				await Bun.$`mkdir -p ${searchPath}`.quiet();

				const allFiles = await readdir(searchPath, { recursive: true });

				const filteredResults = [];

				for (const relativePath of allFiles) {
					const fullPath = join(searchPath, relativePath);
					const stats = await stat(fullPath);
					const isDirectory = stats.isDirectory();

					if (dirOnly && !isDirectory) continue;
					if (!dirOnly && isDirectory) continue;
					if (!dirOnly && !relativePath.endsWith(".md")) continue;

					const vaultRelativePath = folder
						? join(folder, relativePath)
						: relativePath;

					const filename = relativePath.split("/").pop() || "";
					if (keywords.length > 0) {
						const matches = keywords.some((kw) =>
							filename.toLowerCase().includes(kw.toLowerCase()),
						);
						if (!matches) continue;
					}

					if (isDirectory) {
						filteredResults.push({
							path: vaultRelativePath,
							absolutePath: fullPath,
							type: "directory",
						});
					} else {
						const frontmatter: Record<string, unknown> = {};
						try {
							const file = Bun.file(fullPath);
							const content = await file.slice(0, 2048).text();
							const frontmatterMatch = content.match(
								/^---\s*\n([\s\S]*?)\n---\s*\n/,
							);
							if (frontmatterMatch?.[1]) {
								for (const line of frontmatterMatch[1].split("\n")) {
									const match = line.match(/^(\w+):\s*(.+)$/);
									if (match?.[1] && match?.[2]) {
										let value: unknown = match[2].trim();
										if (value === "true") value = true;
										else if (value === "false") value = false;
										else if (/^\d+$/.test(value as string))
											value = parseInt(value as string, 10);
										else if (/^\[.*\]$/.test(value as string)) {
											value = (value as string)
												.slice(1, -1)
												.split(",")
												.map((v) => v.trim().replace(/^["']|["']$/g, ""));
										} else {
											value = (value as string).replace(/^["']|["']$/g, "");
										}
										frontmatter[match[1]] = value;
									}
								}
							}
						} catch {
							// Ignore parsing errors
						}

						filteredResults.push({
							path: vaultRelativePath,
							filename,
							absolutePath: fullPath,
							type: "file",
							...(Object.keys(frontmatter).length > 0 && { frontmatter }),
						});
					}
				}

				await log(
					"info",
					"list_notes",
					{ keywords, folder, dirOnly },
					`Listed ${filteredResults.length} items`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									count: filteredResults.length,
									notes: filteredResults,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const errorMsg = `Failed to list notes: ${String(error)}`;
				await log(
					"error",
					"list_notes",
					{ keywords, folder, dirOnly },
					errorMsg,
				);
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
