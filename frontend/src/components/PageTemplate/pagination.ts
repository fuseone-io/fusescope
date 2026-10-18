export type PageItem = number | 'gap-start' | 'gap-end';

/** 1-based page numbers to show: both ends, the current page and its neighbours. */
export function pageItems(current: number, pageCount: number): PageItem[] {
	if (pageCount <= 7) {
		return Array.from({ length: pageCount }, (_, index) => index + 1);
	}

	const low = current === pageCount ? pageCount - 2 : Math.max(2, current - 1);
	const high = current === 1 ? 3 : Math.min(pageCount - 1, current + 1);
	const middle: PageItem[] = [];
	for (let page = low; page <= high; page += 1) {
		middle.push(page);
	}

	return [
		1,
		...(low > 2 ? (['gap-start'] as const) : []),
		...middle,
		...(high < pageCount - 1 ? (['gap-end'] as const) : []),
		pageCount,
	];
}
