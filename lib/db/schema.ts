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
	link: z.string().optional(), // link to the reference (path, url, etc.)
	metadata: z.record(z.string(), z.unknown()).optional(), // for any extra information about the reference
});

const ItemSchema = z.object({
	id: z.string(),
	category: z.string(),
	desc: z.string(),
	tags: z.array(z.string()).default([]),
	status: z.string().default("active"),
	keyResults: z.array(KeyResultSchema).default([]).optional(), // for key results if needed
	references: z.array(referenceSchema).default([]).optional(), // for related references (notes, designs, assets, etc.)
	metadata: z.record(z.string(), z.unknown()).optional(), // for custom metadata if needed
	createdAt: z.number(),
	updatedAt: z.number().optional(),
});

export const StateSchema = z.object({
	version: z.string(),
	items: z.array(ItemSchema).default([]),
});

export type State = z.infer<typeof StateSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type KeyResult = z.infer<typeof KeyResultSchema>;
export type Reference = z.infer<typeof referenceSchema>;
