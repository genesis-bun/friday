import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import type { Item, KeyResult, Reference } from "@/lib/db/schema.ts";
import { generateId } from "@/lib/utils/id.ts";
import { log } from "@/lib/utils/logger.ts";
import {
	addItem,
	deleteItem,
	getItemsByCategory,
	getProfile,
	getState,
	updateItem,
	updateState,
} from "@/lib/utils/state.ts";

type KeyResultInput = {
	id?: string;
	desc: string;
	target?: string | number;
	current?: string | number;
	unit?: string;
	status?: "not_started" | "in_progress" | "completed" | "at_risk";
};

type ReferenceInput = {
	id?: string;
	type: string;
	link?: string;
	metadata?: Record<string, unknown>;
};

function processKeyResults(
	keyResults: KeyResultInput[] | undefined,
	existingKeyResults?: KeyResult[],
	totalKRs: number = 0,
): KeyResult[] | undefined {
	if (!keyResults) return existingKeyResults;

	return keyResults.map((kr, index) => {
		const existingKr = existingKeyResults?.find(
			(ekr) => ekr.id === kr.id || ekr.desc === kr.desc,
		);
		const targetNum =
			typeof kr.target === "string"
				? parseFloat(kr.target)
				: kr.target;
		const currentNum =
			typeof kr.current === "string"
				? parseFloat(kr.current)
				: kr.current;

		return {
			id: kr.id || existingKr?.id || `kr${totalKRs + index + 1}`,
			desc: kr.desc,
			target:
				targetNum !== undefined && !Number.isNaN(targetNum)
					? targetNum
					: existingKr?.target,
			current:
				currentNum !== undefined && !Number.isNaN(currentNum)
					? currentNum
					: existingKr?.current,
			unit: kr.unit ?? existingKr?.unit,
			status: kr.status || existingKr?.status || "not_started",
		};
	});
}

function processReferences(
	references: ReferenceInput[] | undefined,
): Reference[] | undefined {
	if (!references) return undefined;

	return references.map((ref) => ({
		id: ref.id || `ref-${Date.now()}-${Math.random()}`,
		type: ref.type,
		link: ref.link,
		metadata: ref.metadata,
	}));
}

function buildItemUpdates(
	existingItem: Item,
	params: {
		category?: string;
		desc?: string;
		tags?: string[];
		status?: string;
		keyResults?: KeyResultInput[];
		references?: ReferenceInput[];
		metadata?: Record<string, unknown>;
	},
	totalKRs: number = 0,
): Partial<Item> {
	const updates: Partial<Item> = {};

	if (params.category !== undefined) updates.category = params.category;
	if (params.desc !== undefined) updates.desc = params.desc;
	if (params.tags !== undefined) updates.tags = params.tags;
	if (params.status !== undefined) updates.status = params.status;

	if (params.keyResults !== undefined) {
		const processed = processKeyResults(
			params.keyResults,
			existingItem.keyResults,
			totalKRs,
		);
		updates.keyResults =
			processed && processed.length > 0 ? processed : undefined;
	}

	if (params.references !== undefined) {
		updates.references = processReferences(params.references);
	}

	if (params.metadata !== undefined) {
		const merged = {
			...(existingItem.metadata || {}),
			...params.metadata,
		};
		updates.metadata =
			Object.keys(merged).length > 0 ? merged : undefined;
	}

	return updates;
}

export const registerManageState = (server: McpServer) => {
	server.registerTool(
		"manage_state",
		{
			description: `${config.systemPrompt}\n\nManage items in state or profile. Both use the same unified schema but serve different purposes:\n\n**STATE (source='state')** - Ephemeral/active work → state.yaml:\n- Goals: Active objectives with keyResults (OKR format)\n- Thoughts: Temporary ideas, plans, notes\n- Lifecycle: Can be archived/cleaned periodically\n\n**PROFILE (source='profile')** - Persistent knowledge → profile.yaml:\n- Achievements, skills, projects, personal info, preferences, knowledge, facts, history\n- Lifecycle: Persists across rotations, rarely deleted\n\n**CONSOLIDATION FIRST**: Check for similar existing items before creating. Add new data to their referenced notes instead. Only create when no suitable container exists.\n\nBoth support optional keyResults, references, and metadata.`,
			inputSchema: {
				source: z
					.enum(["state", "profile"])
					.default("state")
					.describe("Data source: 'state' writes to state.yaml (ephemeral/active work), 'profile' writes to profile.yaml (persistent knowledge). Use 'state' for goals/thoughts, 'profile' for achievements/skills/preferences."),
				action: z
					.enum(["create", "get", "update", "delete", "list"])
					.describe("Action to perform"),
				itemId: z
					.string()
					.optional()
					.describe("Item ID (required for get, update, delete)"),
				type: z
					.enum(["goal", "thought"])
					.optional()
					.describe(
						"Type for state items: 'goal' (with keyResults) or 'thought' (without). Ignored for profile.",
					),
				category: z
					.string()
					.optional()
					.describe("Category (required for create)"),
				desc: z
					.string()
					.optional()
					.describe("Description/title (required for create)"),
				tags: z
					.array(z.string())
					.optional()
					.describe("Tags for organization"),
				status: z
					.string()
					.optional()
					.describe("Status (defaults: 'active' for goals/profile, 'raw' for thoughts)"),
				keyResults: z
					.array(
						z.object({
							id: z.string().optional(),
							desc: z.string(),
							target: z.union([z.string(), z.number()]).optional(),
							current: z.union([z.string(), z.number()]).optional(),
							unit: z.string().optional(),
							status: z
								.enum(["not_started", "in_progress", "completed", "at_risk"])
								.optional(),
						}),
					)
					.optional()
					.describe("Key results array"),
				references: z
					.array(
						z.object({
							id: z.string().optional(),
							type: z.string(),
							link: z.string().optional(),
							metadata: z.record(z.string(), z.unknown()).optional(),
						}),
					)
					.optional()
					.describe(
						"References to related items (notes, designs, assets, etc.). For updates, replaces existing references.",
					),
				metadata: z
					.record(z.string(), z.unknown())
					.optional()
					.describe(
						"Custom metadata. For updates, merges with existing metadata.",
					),
			},
		},
		async ({
			source = "state",
			action,
			itemId,
			type,
			category,
			desc,
			tags,
			status,
			keyResults,
			references,
			metadata,
		}) => {
			try {
				if (action === "create") {
					if (!desc || !category) {
						throw new Error(
							"Description and category are required for creating",
						);
					}

					const isState = source === "state";
					const isGoal = type === "goal";

					const data = isState ? await getState() : await getProfile();
					const items = isState && isGoal
						? data.items.filter((item) => (item.keyResults?.length ?? 0) > 0)
						: isState
							? data.items.filter(
									(item) => (item.keyResults?.length ?? 0) === 0,
								)
							: data.items;

					const prefix = isState ? (isGoal ? "g" : "i") : "p";
					const newItemId = generateId(prefix, items);
					const now = Date.now();

					const totalKRs = data.items.reduce(
						(sum, item) => sum + (item.keyResults?.length ?? 0),
						0,
					);

					const processedKeyResults = processKeyResults(
						keyResults,
						undefined,
						totalKRs,
					);
					const processedReferences = processReferences(references);

					const newItem: Item = {
						id: newItemId,
						category,
						desc,
						tags: tags || [],
						status:
							status ||
							(isState ? (isGoal ? "active" : "raw") : "active"),
						keyResults:
							processedKeyResults && processedKeyResults.length > 0
								? processedKeyResults
								: undefined,
						references: processedReferences,
						metadata: metadata && Object.keys(metadata).length > 0
							? metadata
							: undefined,
						createdAt: now,
						updatedAt: now,
					};

					if (isState) {
						const updatedItems = [...data.items, newItem];
						await updateState({ items: updatedItems });
					} else {
						await addItem(newItem);
					}

					const response = isState
						? isGoal
							? `Created goal: ${desc}`
							: `Captured ${category} idea: "${desc.substring(0, 100)}${desc.length > 100 ? "..." : ""}"`
						: `Added ${category} item to profile: "${desc.substring(0, 50)}${desc.length > 50 ? "..." : ""}"`;

					await log("info", "manage_state", { source, action, type, category }, response);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{ success: true, message: response, item: newItem },
									null,
									2,
								),
							},
						],
					};
				}

				if (action === "get") {
					if (!itemId) {
						throw new Error("Item ID is required for getting an item");
					}

					const data = source === "state" ? await getState() : await getProfile();
					const item = data.items.find((i) => i.id === itemId);

					if (!item) {
						throw new Error(`Item with ID ${itemId} not found in ${source}`);
					}

					await log("info", "manage_state", { source, action, itemId }, "Retrieved item");

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({ success: true, item }, null, 2),
							},
						],
					};
				}

				if (action === "update") {
					if (!itemId) {
						throw new Error("Item ID is required for updating");
					}

					const data = source === "state" ? await getState() : await getProfile();
					const itemIndex = data.items.findIndex((item) => item.id === itemId);

					if (itemIndex < 0) {
						throw new Error(`Item with ID ${itemId} not found in ${source}`);
					}

					const existingItem = data.items[itemIndex];
					if (!existingItem) {
						throw new Error(`Item with ID ${itemId} not found in ${source}`);
					}

					const totalKRs = data.items.reduce(
						(sum, item) => sum + (item.keyResults?.length ?? 0),
						0,
					);

					const updates = buildItemUpdates(
						existingItem,
						{ category, desc, tags, status, keyResults, references, metadata },
						totalKRs,
					);
					updates.updatedAt = Date.now();

					if (source === "state") {
						const updatedItems = [...data.items];
						updatedItems[itemIndex] = { ...existingItem, ...updates } as Item;
						await updateState({ items: updatedItems });
					} else {
						await updateItem(itemId, updates);
					}

					const updatedData = source === "state" ? await getState() : await getProfile();
					const updatedItem = updatedData.items.find((i) => i.id === itemId);

					const response = `Updated ${source} item: ${updatedItem?.desc || itemId}`;
					await log("info", "manage_state", { source, action, itemId }, response);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{ success: true, message: response, item: updatedItem },
									null,
									2,
								),
							},
						],
					};
				}

				if (action === "delete") {
					if (!itemId) {
						throw new Error("Item ID is required for deleting");
					}

					if (source === "state") {
						const state = await getState();
						const updatedItems = state.items.filter((item) => item.id !== itemId);
						await updateState({ items: updatedItems });
					} else {
						await deleteItem(itemId);
					}

					const response = `Deleted ${source} item: ${itemId}`;
					await log("info", "manage_state", { source, action, itemId }, response);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{ success: true, message: response },
									null,
									2,
								),
							},
						],
					};
				}

				if (action === "list") {
					const data = source === "state" ? await getState() : await getProfile();
					let items = data.items;

					if (category) {
						if (source === "profile") {
							items = await getItemsByCategory(category);
						} else {
							items = items.filter((item) => item.category === category);
						}
					}

					items = items.sort((a, b) => b.createdAt - a.createdAt);

					await log(
						"info",
						"manage_state",
						{ source, action, category },
						`Listed ${items.length} items`,
					);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										count: items.length,
										category: category || "all",
										items,
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
				const errorMsg = `Failed to manage ${source}: ${String(error)}`;
				await log("error", "manage_state", { source, action, itemId }, errorMsg);
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
