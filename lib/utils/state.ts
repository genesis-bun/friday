import { config } from "@/config.ts";
import { type Item, type State, StateSchema } from "@/lib/db/schema.ts";
import { resolvePath } from "./path.ts";
import { cleanValue, createStorage } from "./storage.ts";

const STATE_FILE = Bun.file(resolvePath(config.stateFile));
const PROFILE_FILE = Bun.file(resolvePath(config.profileFile));

const DEFAULTS = {
	keyResult: {
		status: "not_started",
	},
	item: {
		status: "active",
		tags: [],
	},
};

function serializeState(state: State): unknown {
	const cleaned = {
		version: state.version,
		items: state.items.map((item) => {
			const cleanedItem = cleanValue(item, DEFAULTS.item) as Record<
				string,
				unknown
			>;
			if (cleanedItem.keyResults) {
				cleanedItem.keyResults = (cleanedItem.keyResults as unknown[]).map(
					(kr) => cleanValue(kr, DEFAULTS.keyResult),
				);
			}
			return cleanedItem;
		}),
	};

	if (Array.isArray(cleaned.items) && cleaned.items.length === 0) {
		delete (cleaned as Record<string, unknown>).items;
	}

	return cleaned;
}

const defaultState: State = {
	version: "1.0.0",
	items: [],
};

const stateStorage = createStorage({
	file: STATE_FILE,
	schema: StateSchema,
	defaultValue: defaultState,
	defaults: DEFAULTS,
	serialize: serializeState,
});

const profileStorage = createStorage({
	file: PROFILE_FILE,
	schema: StateSchema,
	defaultValue: defaultState,
	defaults: DEFAULTS,
	serialize: serializeState,
});

export const getState = async (): Promise<State> => {
	try {
		const state = await stateStorage.get();
		if (state.items.length === 0) {
			const filePath = resolvePath(config.stateFile);
			const exists = await STATE_FILE.exists();
			if (exists) {
				console.warn(
					`State file exists at ${filePath} but returned empty items`,
				);
			}
		}
		return state;
	} catch (error) {
		console.error("Error getting state:", error);
		throw error;
	}
};

export const saveState = stateStorage.save;
export const updateState = stateStorage.update;

export const getProfile = profileStorage.get;
export const saveProfile = profileStorage.save;
export const updateProfile = profileStorage.update;

export function matchesKeyword(item: Item, keyword: string): boolean {
	const lowerKeyword = keyword.toLowerCase();
	return (
		item.desc.toLowerCase().includes(lowerKeyword) ||
		item.category.toLowerCase().includes(lowerKeyword) ||
		item.tags.some((tag) => tag.toLowerCase().includes(lowerKeyword))
	);
}

export const getItemsByCategory = async (category: string): Promise<Item[]> => {
	const profile = await getProfile();
	return profile.items.filter((item) => item.category === category);
};

export const addItem = async (item: Item): Promise<State> => {
	const profile = await getProfile();
	const updatedItems = [...profile.items, item];
	return await updateProfile({ items: updatedItems });
};

export const updateItem = async (
	itemId: string,
	updates: Partial<Item>,
): Promise<State> => {
	const profile = await getProfile();
	const itemIndex = profile.items.findIndex((item) => item.id === itemId);
	if (itemIndex < 0) {
		throw new Error(`Item with ID ${itemId} not found`);
	}
	const existingItem = profile.items[itemIndex];
	if (!existingItem) {
		throw new Error(`Item with ID ${itemId} not found`);
	}
	const updatedItems = [...profile.items];
	updatedItems[itemIndex] = {
		...existingItem,
		...updates,
		updatedAt: Date.now(),
	};
	return await updateProfile({ items: updatedItems });
};

export const deleteItem = async (itemId: string): Promise<State> => {
	const profile = await getProfile();
	const updatedItems = profile.items.filter((item) => item.id !== itemId);
	return await updateProfile({ items: updatedItems });
};
