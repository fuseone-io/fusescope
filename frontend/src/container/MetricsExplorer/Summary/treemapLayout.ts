export interface TreemapEntry {
	id: string;
	value: number;
}

export interface TreemapRect extends TreemapEntry {
	x: number;
	y: number;
	width: number;
	height: number;
	/** Fraction of the total, 0–1. */
	share: number;
}

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

function split(entries: TreemapEntry[], box: Box, out: Box[]): void {
	if (entries.length === 1) {
		out.push(box);
		return;
	}
	const total = entries.reduce((sum, entry) => sum + entry.value, 0);
	let index = 0;
	let head = 0;
	while (
		index < entries.length - 1 &&
		head + entries[index].value <= total / 2
	) {
		head += entries[index].value;
		index += 1;
	}
	if (index === 0) {
		head = entries[0].value;
		index = 1;
	}
	const ratio = head / total;
	const [first, second] =
		box.width >= box.height
			? [
					{ ...box, width: box.width * ratio },
					{
						...box,
						x: box.x + box.width * ratio,
						width: box.width * (1 - ratio),
					},
				]
			: [
					{ ...box, height: box.height * ratio },
					{
						...box,
						y: box.y + box.height * ratio,
						height: box.height * (1 - ratio),
					},
				];
	split(entries.slice(0, index), first, out);
	split(entries.slice(index), second, out);
}

/** Binary treemap: halves the entries by value, along the box's longer side. */
export function layoutTreemap(
	entries: TreemapEntry[],
	size: { width: number; height: number },
): TreemapRect[] {
	const sorted = entries
		.filter((entry) => entry.value > 0)
		.sort((a, b) => b.value - a.value);
	const total = sorted.reduce((sum, entry) => sum + entry.value, 0);
	if (!sorted.length || total <= 0) {
		return [];
	}
	const boxes: Box[] = [];
	split(sorted, { x: 0, y: 0, ...size }, boxes);
	return sorted.map((entry, index) => ({
		...entry,
		...boxes[index],
		share: entry.value / total,
	}));
}
