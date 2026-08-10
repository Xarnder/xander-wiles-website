export function normalizeOrders<T extends { order: number }>(items: T[]): T[] {
	return items.map((item, index) => ({ ...item, order: index }));
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
	if (
		fromIndex < 0 ||
		toIndex < 0 ||
		fromIndex >= items.length ||
		toIndex >= items.length ||
		fromIndex === toIndex
	) {
		return items;
	}
	const next = [...items];
	const [removed] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, removed);
	return next;
}

export function sortBySortOrder<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => {
		if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
		return a.name.localeCompare(b.name);
	});
}
