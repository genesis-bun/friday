import { z } from "zod";

const KeyResultSchema = z.object({
	id: z.string(),
	desc: z.string(),
	target: z.number().optional(),
	current: z.number().optional(),
	unit: z.string().optional(),
	status: z
		.enum(["not_started", "in_progress", "completed", "at_risk"])
		.default("not_started"),
});

const referenceSchema = z.object({
	id: z.string(),
	type: z.string(),
	link: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

const ItemSchema = z.object({
	id: z.string(),
	category: z.string(),
	desc: z.string(),
	tags: z.array(z.string()).default([]),
	status: z.string().default("active"),
	keyResults: z.array(KeyResultSchema).default([]).optional(),
	references: z.array(referenceSchema).default([]).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	createdAt: z.number(),
	updatedAt: z.number().optional(),
});

export const StateSchema = z.object({
	version: z.string(),
	items: z.array(ItemSchema).default([]),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type State = z.infer<typeof StateSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type KeyResult = z.infer<typeof KeyResultSchema>;
export type Reference = z.infer<typeof referenceSchema>;
