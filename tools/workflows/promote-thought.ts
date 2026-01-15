import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { log } from "@/lib/utils/logger.ts";
import { generateNotePath, writeNote } from "@/lib/utils/notes.ts";
import { getState, updateState } from "@/lib/utils/state.ts";

export const registerPromoteThought = (server: McpServer) => {
	server.registerTool(
		"promote_thought",
		{
			description: `${config.systemPrompt}\n\nPromote a thought from state.yaml to a permanent note in the vault. Updates thought status to "processed" and links the note path in metadata.`,
			inputSchema: {
				thoughtId: z.string().describe("ID of the thought to promote"),
				title: z
					.string()
					.optional()
					.describe("Title for the note (auto-generated if not provided)"),
				path: z
					.string()
					.optional()
					.describe("Path for the note (auto-generated if not provided)"),
				content: z
					.string()
					.optional()
					.describe("Note content (uses thought description if not provided)"),
			},
		},
		async ({ thoughtId, title, path, content }) => {
			try {
				const state = await getState();
				const thought = state.items.find((item) => item.id === thoughtId);

				if (!thought) {
					throw new Error(`Thought with ID ${thoughtId} not found`);
				}

				if ((thought.keyResults?.length ?? 0) > 0) {
					throw new Error("Item is a goal, not a thought");
				}

				const noteTitle = title || thought.desc.substring(0, 50);
				const notePath = path || (await generateNotePath(noteTitle));
				const noteContent = content || thought.desc;

				await writeNote(notePath, noteContent);

				const updatedItems = state.items.map((item) =>
					item.id === thoughtId
						? {
								...item,
								status: "processed",
								updatedAt: Date.now(),
								metadata: {
									...((item.metadata as Record<string, unknown>) || {}),
									notePath,
								},
							}
						: item,
				);

				await updateState({ items: updatedItems });

				await log(
					"info",
					"promote_thought",
					{ thoughtId, notePath },
					`Promoted thought to note: ${notePath}`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									message: `Promoted thought to note: ${notePath}`,
									notePath,
									thoughtId,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const errorMsg = `Failed to promote thought: ${String(error)}`;
				await log("error", "promote_thought", { thoughtId }, errorMsg);
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
