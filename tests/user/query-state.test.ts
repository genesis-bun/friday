import { beforeEach, expect, test } from "bun:test";
import type { Item, State } from "@/lib/db/schema.ts";
import { matchesKeyword } from "@/lib/utils/state.ts";

function createMockGoal(id: string, category: string, desc: string): Item {
	return {
		id,
		category,
		desc,
		status: "active",
		tags: [],
		keyResults: [
			{
				id: `kr-${id}`,
				desc: "Test key result",
				status: "in_progress",
			},
		],
		createdAt: Date.now(),
	};
}

function createMockIdea(
	id: string,
	category: string,
	desc: string,
	tags: string[] = [],
): Item {
	return {
		id,
		category,
		desc,
		status: "raw",
		tags,
		metadata: {
			priority: "medium",
		},
		createdAt: Date.now(),
	};
}

function createMockProfileItem(
	id: string,
	category: string,
	desc: string,
	tags: string[] = [],
): Item {
	return {
		id,
		category,
		desc,
		status: "active",
		tags,
		createdAt: Date.now(),
	};
}

function queryStateLogic(
	state: State,
	profile: State | null,
	options: {
		view?: "all" | "goals" | "thoughts" | "profile";
		category?: string;
		tags?: string[];
		keyword?: string;
		limit?: number;
	} = {},
): Record<string, unknown> {
	const { view = "all", category, tags, keyword, limit } = options;
	const output: Record<string, unknown> = {};

	if (view === "goals" || view === "all") {
		let goals = (state.items || []).filter(
			(item) => (item.keyResults?.length ?? 0) > 0,
		);
		if (category) {
			goals = goals.filter((g) => g.category === category);
		}
		if (keyword) {
			goals = goals.filter((g) => matchesKeyword(g, keyword));
		}
		if (limit !== undefined) {
			goals = goals.slice(0, limit);
		}
		output.goals = goals;
	}

	if (view === "thoughts" || view === "all") {
		let thoughts = (state.items || []).filter(
			(item) => (item.keyResults?.length ?? 0) === 0,
		);
		if (category) {
			thoughts = thoughts.filter((i) => i.category === category);
		}
		if (tags && tags.length > 0) {
			thoughts = thoughts.filter((i) => tags.every((tag) => i.tags.includes(tag)));
		}
		if (keyword) {
			thoughts = thoughts.filter((i) => matchesKeyword(i, keyword));
		}
		if (limit !== undefined) {
			thoughts = thoughts.slice(0, limit);
		}
		output.thoughts = thoughts;
	}

	if (view === "profile" || view === "all") {
		if (profile) {
			let items = profile.items || [];
			if (category) {
				items = items.filter((item) => item.category === category);
			}
			if (tags && tags.length > 0) {
				items = items.filter((item) =>
					tags.every((tag) => item.tags.includes(tag)),
				);
			}
			if (keyword) {
				items = items.filter((item) => matchesKeyword(item, keyword));
			}
			if (limit !== undefined) {
				items = items.slice(0, limit);
			}
			output.profile = { ...profile, items };
		} else {
			output.profile = null;
		}
	}

	return output;
}

let mockState: State;
let mockProfile: State;

beforeEach(() => {
	mockState = {
		version: "1.0.0",
		items: [
			createMockGoal("g1", "tech", "Build a web application"),
			createMockGoal("g2", "career", "Get a new job"),
			createMockIdea("i1", "tech", "Learn TypeScript", ["learning", "tech"]),
			createMockIdea("i2", "personal", "Write a blog post", ["writing"]),
			createMockIdea("i3", "tech", "Study React patterns", [
				"learning",
				"tech",
			]),
		],
	};

	mockProfile = {
		version: "1.0.0",
		items: [
			createMockProfileItem("p1", "skills", "Full-stack development", [
				"tech",
				"web",
			]),
			createMockProfileItem(
				"p2",
				"achievements",
				"Published open source project",
				["oss"],
			),
		],
	};
});

test("returns all goals, thoughts, and profile when view is 'all'", () => {
	const result = queryStateLogic(mockState, mockProfile, { view: "all" });

	console.log("✓ Checkpoint: All view result", JSON.stringify(result, null, 2));

	expect(result.goals).toBeArray();
	expect(result.thoughts).toBeArray();
	expect(result.profile).toBeObject();

	expect((result.goals as Item[]).length).toBe(2);
	expect((result.thoughts as Item[]).length).toBe(3);
	expect((result.profile as State).items.length).toBe(2);
});

test("filters goals by category", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "goals",
		category: "tech",
	});

	console.log("✓ Checkpoint: Goals filtered by category 'tech'", JSON.stringify(result.goals, null, 2));

	expect(result.goals).toBeArray();
	const goals = result.goals as Item[];
	expect(goals.length).toBe(1);
	expect(goals[0]?.category).toBe("tech");
	expect(goals[0]?.id).toBe("g1");
});

test("filters thoughts by category", () => {
		const result = queryStateLogic(mockState, mockProfile, {
			view: "thoughts",
		category: "tech",
	});

	console.log("✓ Checkpoint: Thoughts filtered by category 'tech'", JSON.stringify(result.thoughts, null, 2));

	expect(result.thoughts).toBeArray();
	expect((result.thoughts as Item[]).length).toBe(2);
	expect((result.thoughts as Item[]).every((i) => i.category === "tech")).toBe(
		true,
	);
});

test("filters thoughts by tags", () => {
		const result = queryStateLogic(mockState, mockProfile, {
			view: "thoughts",
		tags: ["learning"],
	});

	console.log("✓ Checkpoint: Thoughts filtered by tags ['learning']", JSON.stringify(result.thoughts, null, 2));

	expect(result.thoughts).toBeArray();
	expect((result.thoughts as Item[]).length).toBe(2);
	expect(
		(result.thoughts as Item[]).every((i) => i.tags.includes("learning")),
	).toBe(true);
});

test("filters by keyword in description", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "all",
		keyword: "web",
	});

	console.log("✓ Checkpoint: Filtered by keyword 'web'", {
		goals: result.goals,
		thoughts: result.thoughts,
	});

	const goals = result.goals as Item[];
	expect(goals.length).toBe(1);
	expect(goals[0]?.desc).toContain("web");
});

test("filters by keyword in category", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "all",
		keyword: "tech",
	});

	expect((result.goals as Item[]).length).toBe(1);
	expect((result.thoughts as Item[]).length).toBe(2);
});

test("filters by keyword in tags", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "thoughts",
		keyword: "learning",
	});

	expect((result.thoughts as Item[]).length).toBe(2);
	expect(
		(result.thoughts as Item[]).every(
			(i) =>
				i.desc.toLowerCase().includes("learning") ||
				i.category.toLowerCase().includes("learning") ||
				i.tags.some((tag) => tag.toLowerCase().includes("learning")),
		),
	).toBe(true);
});

test("applies limit to results", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "all",
		limit: 1,
	});

	console.log("✓ Checkpoint: Results with limit=1", {
		goalsCount: (result.goals as Item[]).length,
		thoughtsCount: (result.thoughts as Item[]).length,
		profileCount: (result.profile as State).items.length,
	});

	expect((result.goals as Item[]).length).toBe(1);
	expect((result.ideas as Item[]).length).toBe(1);
	expect((result.profile as State).items.length).toBe(1);
});

test("returns empty arrays when no matches found", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "goals",
		category: "nonexistent",
	});

	expect(result.goals).toBeArray();
	expect((result.goals as Item[]).length).toBe(0);
});

test("handles null profile gracefully", () => {
	const result = queryStateLogic(mockState, null, { view: "all" });

	console.log("✓ Checkpoint: Null profile handling", {
		goalsCount: (result.goals as Item[]).length,
		thoughtsCount: (result.thoughts as Item[]).length,
		profile: result.profile,
	});

	expect(result.goals).toBeArray();
	expect(result.thoughts).toBeArray();
	expect(result.profile).toBeNull();
});

test("filters profile items by category", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "profile",
		category: "skills",
	});

	const profile = result.profile as State;
	expect(profile.items.length).toBe(1);
	expect(profile.items[0]?.category).toBe("skills");
});

test("filters profile items by tags", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "profile",
		tags: ["tech"],
	});

	const profile = result.profile as State;
	expect(profile.items.length).toBe(1);
	expect(profile.items[0]?.tags).toContain("tech");
});

test("keyword search is case-insensitive", () => {
	const result = queryStateLogic(mockState, mockProfile, {
		view: "goals",
		keyword: "WEB",
	});

	const goals = result.goals as Item[];
	expect(goals.length).toBe(1);
	expect(goals[0]?.desc.toLowerCase()).toContain("web");
});

test("distinguishes goals from thoughts by keyResults presence", () => {
	const stateWithMixed: State = {
		version: "1.0.0",
		items: [
			createMockGoal("g1", "tech", "Goal with key results"),
			createMockIdea("i1", "tech", "Idea without key results"),
		],
	};

	const goalsResult = queryStateLogic(stateWithMixed, null, { view: "goals" });
	const thoughtsResult = queryStateLogic(stateWithMixed, null, { view: "thoughts" });

	console.log("✓ Checkpoint: Goals vs Thoughts distinction", {
		goals: goalsResult.goals,
		thoughts: thoughtsResult.thoughts,
	});

	const goals = goalsResult.goals as Item[];
	expect(goals.length).toBe(1);
	if (goals[0]) {
		expect(goals[0].id).toBe("g1");
	}

	const thoughts = thoughtsResult.thoughts as Item[];
	expect(thoughts.length).toBe(1);
	if (thoughts[0]) {
		expect(thoughts[0].id).toBe("i1");
	}
});
