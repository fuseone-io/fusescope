interface Link {
	source: string;
	target: string;
}

export interface Point {
	x: number;
	y: number;
}

export interface GraphLayout {
	positions: Record<string, Point>;
	width: number;
	height: number;
}

export const COLUMN_GAP = 200;
export const ROW_GAP = 104;
export const PADDING = 80;
/** Taller columns wrap into several, so a wide fan-out stays readable. */
const MAX_COLUMN_ROWS = 10;
const SWEEPS = 3;

function adjacency(ids: string[], links: Link[]): Map<string, string[]> {
	const known = new Set(ids);
	const out = new Map<string, string[]>(ids.map((id) => [id, []]));
	links.forEach(({ source, target }) => {
		if (source !== target && known.has(source) && known.has(target)) {
			out.get(source)?.push(target);
		}
	});
	return out;
}

/** Links that close a cycle, found depth first from the entry points. */
function backLinks(ids: string[], out: Map<string, string[]>): Set<string> {
	const called = new Set(Array.from(out.values()).flat());
	const starts = [
		...ids.filter((id) => !called.has(id)),
		...ids.filter((id) => called.has(id)),
	];
	const state = new Map<string, 'open' | 'done'>();
	const back = new Set<string>();
	const visit = (id: string): void => {
		state.set(id, 'open');
		(out.get(id) ?? []).forEach((next) => {
			if (state.get(next) === 'open') {
				back.add(`${id}>${next}`);
			} else if (!state.has(next)) {
				visit(next);
			}
		});
		state.set(id, 'done');
	};
	starts.forEach((id) => {
		if (!state.has(id)) {
			visit(id);
		}
	});
	return back;
}

/** Column per node: entry points at 0, every callee right of its deepest caller. */
export function assignLayers(
	ids: string[],
	links: Link[],
): Map<string, number> {
	const out = adjacency(ids, links);
	const back = backLinks(ids, out);
	const forward = new Map(
		ids.map((id) => [
			id,
			(out.get(id) ?? []).filter((next) => !back.has(`${id}>${next}`)),
		]),
	);
	const incoming = new Map(ids.map((id) => [id, 0]));
	forward.forEach((targets) =>
		targets.forEach((target) =>
			incoming.set(target, (incoming.get(target) ?? 0) + 1),
		),
	);
	const layers = new Map(ids.map((id) => [id, 0]));
	const queue = ids.filter((id) => incoming.get(id) === 0);
	while (queue.length) {
		const id = queue.shift() as string;
		(forward.get(id) ?? []).forEach((next) => {
			layers.set(next, Math.max(layers.get(next) ?? 0, (layers.get(id) ?? 0) + 1));
			incoming.set(next, (incoming.get(next) ?? 0) - 1);
			if (incoming.get(next) === 0) {
				queue.push(next);
			}
		});
	}
	return layers;
}

function sweep(
	columns: string[][],
	neighbours: Map<string, string[]>,
	indices: number[],
): void {
	indices.forEach((column) => {
		const index = new Map<string, number>();
		columns.forEach((ids) => ids.forEach((id, row) => index.set(id, row)));
		const key = (id: string): number => {
			const rows = (neighbours.get(id) ?? [])
				.map((other) => index.get(other))
				.filter((row): row is number => row !== undefined);
			return rows.length
				? rows.reduce((sum, row) => sum + row, 0) / rows.length
				: (index.get(id) ?? 0);
		};
		columns[column] = columns[column]
			.map((id) => ({ id, key: key(id), row: index.get(id) ?? 0 }))
			.sort((a, b) => a.key - b.key || a.row - b.row)
			.map(({ id }) => id);
	});
}

/** Nodes of each column, ordered by the barycentre of their neighbours. */
export function orderLayers(
	layers: Map<string, number>,
	links: Link[],
): string[][] {
	const count = Math.max(-1, ...Array.from(layers.values())) + 1;
	const columns: string[][] = Array.from({ length: count }, () => []);
	layers.forEach((layer, id) => columns[layer].push(id));
	const callers = new Map<string, string[]>();
	const callees = new Map<string, string[]>();
	links.forEach(({ source, target }) => {
		if (source !== target && layers.has(source) && layers.has(target)) {
			callers.set(target, [...(callers.get(target) ?? []), source]);
			callees.set(source, [...(callees.get(source) ?? []), target]);
		}
	});
	const right = columns.map((_, index) => index).slice(1);
	const left = columns
		.map((_, index) => index)
		.slice(0, -1)
		.reverse();
	for (let pass = 0; pass < SWEEPS; pass += 1) {
		sweep(columns, callers, right);
		sweep(columns, callees, left);
	}
	sweep(columns, callers, right);
	return columns;
}

/** Left-to-right layered positions: entry points left, deeper dependencies right. */
export function layeredLayout(ids: string[], links: Link[]): GraphLayout {
	const columns = orderLayers(assignLayers(ids, links), links);
	const wrapped = columns.flatMap((column) => {
		const parts = Math.max(1, Math.ceil(column.length / MAX_COLUMN_ROWS));
		return Array.from({ length: parts }, (_, part) =>
			column.filter((_id, row) => row % parts === part),
		);
	});
	const tallest = Math.max(1, ...wrapped.map((column) => column.length));
	const height = (tallest - 1) * ROW_GAP;
	const positions: Record<string, Point> = {};
	wrapped.forEach((column, index) => {
		const offset = (height - (column.length - 1) * ROW_GAP) / 2;
		column.forEach((id, row) => {
			positions[id] = {
				x: PADDING + index * COLUMN_GAP,
				y: PADDING + offset + row * ROW_GAP,
			};
		});
	});
	return {
		positions,
		width: PADDING * 2 + Math.max(0, wrapped.length - 1) * COLUMN_GAP,
		height: PADDING * 2 + height,
	};
}
