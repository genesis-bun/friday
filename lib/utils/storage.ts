import yaml from "js-yaml";
import type { z } from "zod";

export function deepMerge<T extends Record<string, unknown>>(
	target: T,
	source: Partial<T>,
): T {
	const result = { ...target };
	for (const key in source) {
		if (
			source[key] &&
			typeof source[key] === "object" &&
			!Array.isArray(source[key]) &&
			target[key] &&
			typeof target[key] === "object" &&
			!Array.isArray(target[key])
		) {
			result[key] = deepMerge(
				target[key] as Record<string, unknown>,
				source[key] as Partial<Record<string, unknown>>,
			) as T[Extract<keyof T, string>];
		} else {
			result[key] = source[key] as T[Extract<keyof T, string>];
		}
	}
	return result;
}

export function cleanValue(
	value: unknown,
	defaults?: Record<string, unknown>,
): unknown {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return undefined;
		}
		return value.map((item) => cleanValue(item));
	}

	if (typeof value === "object" && value !== null) {
		const obj = value as Record<string, unknown>;
		const cleaned: Record<string, unknown> = {};
		for (const key in obj) {
			const val = obj[key];
			// Skip if matches default value
			if (defaults && key in defaults && val === defaults[key]) {
				continue;
			}
			const cleanedVal = cleanValue(val);
			if (cleanedVal !== undefined) {
				cleaned[key] = cleanedVal;
			}
		}
		return Object.keys(cleaned).length > 0 ? cleaned : undefined;
	}

	return value;
}

export function createStorage<T extends { version: string }>(config: {
	file: ReturnType<typeof Bun.file>;
	schema: z.ZodSchema<T>;
	defaultValue: T;
	defaults?: Record<string, Record<string, unknown>>;
	serialize?: (data: T) => unknown;
}) {
	const { file, schema, defaultValue, serialize } = config;

	const get = async (): Promise<T> => {
		try {
			const content = await file.text();
			if (!content.trim()) {
				return defaultValue;
			}
			const parsed = yaml.load(content);
			return schema.parse(parsed);
		} catch (error) {
			console.error("Storage get error:", error);
			return defaultValue;
		}
	};

	const save = async (data: T): Promise<void> => {
		schema.parse(data);
		const serialized = serialize ? serialize(data) : data;
		await Bun.write(file, yaml.dump(serialized, { indent: 2 }));
	};

	const update = async (updates: Partial<T>): Promise<T> => {
		const current = await get();
		const updated = deepMerge(current, updates);
		await save(updated);
		return updated;
	};

	return { get, save, update };
}
