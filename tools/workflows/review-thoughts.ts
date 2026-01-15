import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import { log } from "@/lib/utils/logger.ts";
import { getState, updateState } from "@/lib/utils/state.ts";

interface ReviewState {
	lastReviewDate: number;
	nextReviewDate: number;
}

function formatThoughtsByAge(
	thoughts: Array<{
		desc: string;
		createdAt: number;
		id: string;
		category: string;
	}>,
) {
	const now = Date.now();
	const weekMs = 7 * 24 * 60 * 60 * 1000;
	const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

	const groups = {
		"This Week": thoughts.filter((t) => now - t.createdAt < weekMs),
		"Last Week": thoughts.filter((t) => {
			const age = now - t.createdAt;
			return age >= weekMs && age < twoWeeksMs;
		}),
		Older: thoughts.filter((t) => now - t.createdAt >= twoWeeksMs),
	};

	return groups;
}

export const registerReviewThoughts = (server: McpServer) => {
	server.registerTool(
		"review_thoughts",
		{
			description: `${config.systemPrompt}\n\nReview thoughts and raw ideas from state.yaml grouped by age. Use promote_thought to convert to permanent note, or manage_state to delete only when user calls it manually.`,
			inputSchema: {
				force: z
					.boolean()
					.optional()
					.default(false)
					.describe("Force review even if not due"),
			},
		},
		async ({ force = false }) => {
			try {
				const state = await getState();
				const existingReviewState =
					((state.metadata as Record<string, unknown>)
						?.review as ReviewState) || null;

				if (
					!force &&
					existingReviewState &&
					Date.now() < existingReviewState.nextReviewDate
				) {
					const daysUntil = Math.ceil(
						(existingReviewState.nextReviewDate - Date.now()) /
							(24 * 60 * 60 * 1000),
					);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message: `Next review scheduled in ${daysUntil} days`,
										nextReviewDate: existingReviewState.nextReviewDate,
									},
									null,
									2,
								),
							},
						],
					};
				}

				const thoughts = state.items.filter(
					(item) => (item.keyResults?.length ?? 0) === 0,
				);

				const grouped = formatThoughtsByAge(thoughts);

				const summary = {
					"This Week": grouped["This Week"].length,
					"Last Week": grouped["Last Week"].length,
					Older: grouped.Older.length,
					total: thoughts.length,
				};

				const newReviewState: ReviewState = {
					lastReviewDate: Date.now(),
					nextReviewDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
				};

				const currentMetadata =
					(state.metadata as Record<string, unknown>) || {};
				await updateState({
					metadata: {
						...currentMetadata,
						review: newReviewState,
					},
					items: state.items.map((item) =>
						(item.keyResults?.length ?? 0) === 0
							? { ...item, updatedAt: Date.now() }
							: item,
					),
				});

				await log(
					"info",
					"review_thoughts",
					{ force },
					`Reviewing ${thoughts.length} thoughts`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: true,
									summary,
									groups: grouped,
									message:
										"Review thoughts grouped by age. Use promote_thought to convert to permanent note, or manage_state to delete.",
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const errorMsg = `Failed to review thoughts: ${String(error)}`;
				await log("error", "review_thoughts", { force }, errorMsg);
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
