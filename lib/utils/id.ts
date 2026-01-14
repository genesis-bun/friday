export function generateId(
	prefix: string,
	existingItems: Array<{ id: string }>,
): string {
	const existingNumbers = existingItems
		.map((item) => {
			const match = item.id.match(new RegExp(`^${prefix}(\\d+)$`));
			return match?.[1] ? parseInt(match[1], 10) : 0;
		})
		.filter((num) => num > 0);

	const nextNumber =
		existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

	return `${prefix}${nextNumber}`;
}

export function generateKeyResultId(
	allItems: Array<{ keyResults?: Array<{ id: string }> }>,
): string {
	const existingKrIds = new Set<string>();
	for (const item of allItems) {
		if (item.keyResults) {
			for (const kr of item.keyResults) {
				existingKrIds.add(kr.id);
			}
		}
	}

	const existingNumbers = Array.from(existingKrIds)
		.map((id) => {
			const match = id.match(/^kr(\d+)$/);
			return match?.[1] ? parseInt(match[1], 10) : 0;
		})
		.filter((num) => num > 0);

	const nextNumber =
		existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

	return `kr${nextNumber}`;
}

export function generateReferenceId(
	allItems: Array<{ references?: Array<{ id: string }> }>,
): string {
	const existingRefIds = new Set<string>();
	for (const item of allItems) {
		if (item.references) {
			for (const ref of item.references) {
				existingRefIds.add(ref.id);
			}
		}
	}

	const existingNumbers = Array.from(existingRefIds)
		.map((id) => {
			const match = id.match(/^ref(\d+)$/);
			return match?.[1] ? parseInt(match[1], 10) : 0;
		})
		.filter((num) => num > 0);

	const nextNumber =
		existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

	return `ref${nextNumber}`;
}
