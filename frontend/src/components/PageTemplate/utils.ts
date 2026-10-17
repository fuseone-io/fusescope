import { SortDirection, SortState } from './types';

/** The active column flips; another column starts at `initial`. */
export function nextSort<Key extends string>(
	current: SortState<Key>,
	key: Key,
	initial: SortDirection = 'desc',
): SortState<Key> {
	if (current.key === key) {
		return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
	}
	return { key, direction: initial };
}

export function compareRows<Row, Key extends keyof Row>(
	key: Key,
	direction: SortDirection,
): (a: Row, b: Row) => number {
	const sign = direction === 'asc' ? 1 : -1;

	return (a, b): number => {
		const left = a[key];
		const right = b[key];
		if (typeof left === 'number' && typeof right === 'number') {
			return sign * (left - right);
		}
		return sign * String(left).localeCompare(String(right));
	};
}

/** 1-based; a page past the end returns the last one. */
export function pageOf<Item>(
	items: Item[],
	page: number,
	pageSize: number,
): Item[] {
	const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
	const current = Math.min(Math.max(page, 1), pageCount);
	return items.slice((current - 1) * pageSize, current * pageSize);
}
