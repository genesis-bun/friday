import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { log } from "@/lib/utils/logger.ts";
import { writeNote } from "@/lib/utils/notes.ts";
import { getState } from "@/lib/utils/state.ts";

export const registerSyncGoals = (server: McpServer) => {
	server.registerTool(
		"sync_goals",
		{
			description: `${config.systemPrompt}\n\nSync active goals from state.yaml to a minimal Goals.md file in the vault. Creates a concise overview for quick reference and linking.`,
			inputSchema: {
				path: z
					.string()
					.optional()
					.default("Goals.md")
					.describe("Path for the goals file (relative to vault root)"),
			},
		},
		async ({ path = "Goals.md" }) => {
			try {
				const state = await getState();
				const activeGoals = state.items.filter(
					(item) =>
						(item.keyResults?.length ?? 0) > 0 && item.status === "active",
				);

				if (activeGoals.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message: "No active goals found",
										count: 0,
									},
									null,
									2,
								),
							},
						],
					};
				}

				const goalsContent = activeGoals
					.map((goal) => {
						let content = `## ${goal.desc}\n\n`;
						content += `**Status:** ${goal.status}\n\n`;

						if (goal.keyResults && goal.keyResults.length > 0) {
							content += `**Key Results:**\n`;
							goal.keyResults.forEach((kr) => {
								const current = kr.current ?? "—";
								const target = kr.target ?? "—";
								const unit = kr.unit ? ` ${kr.unit}` : "";
								content += `- ${kr.desc}: ${current}/${target}${unit} (${kr.status})\n`;
							});
						}

						if (goal.category) {
							content += `\n**Category:** ${goal.category}\n`;
						}

						return content;
					})
					.join("\n---\n\n");

				const fullContent = `# Goals Overview\n\n*Last synced: ${new Date().toLocaleDateString()}*\n\n${goalsContent}`;

				await writeNote(path, fullContent);

				await log(
					"info",
					"sync_goals",
					{ path, count: activeGoals.length },
					`Synced ${activeGoals.length} goals to ${path}`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									message: `Synced ${activeGoals.length} goals to ${path}`,
									path,
									count: activeGoals.length,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const errorMsg = `Failed to sync goals: ${String(error)}`;
				await log("error", "sync_goals", { path }, errorMsg);
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
