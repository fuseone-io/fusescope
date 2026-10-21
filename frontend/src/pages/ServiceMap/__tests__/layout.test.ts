import { assignLayers, layeredLayout, orderLayers } from '../utils/layout';

const edges = (
	pairs: [string, string][],
): { source: string; target: string }[] =>
	pairs.map(([source, target]) => ({ source, target }));

describe('assignLayers', () => {
	it.each<{
		name: string;
		ids: string[];
		pairs: [string, string][];
		expected: Record<string, number>;
	}>([
		{
			name: 'a chain goes left to right',
			ids: ['c', 'b', 'a'],
			pairs: [
				['a', 'b'],
				['b', 'c'],
			],
			expected: { a: 0, b: 1, c: 2 },
		},
		{
			name: 'fan-out puts the callees in one column',
			ids: ['a', 'b', 'c', 'd'],
			pairs: [
				['a', 'b'],
				['a', 'c'],
				['a', 'd'],
			],
			expected: { a: 0, b: 1, c: 1, d: 1 },
		},
		{
			name: 'a node sits right of its deepest caller',
			ids: ['a', 'b', 'c'],
			pairs: [
				['a', 'b'],
				['b', 'c'],
				['a', 'c'],
			],
			expected: { a: 0, b: 1, c: 2 },
		},
		{
			name: 'a cycle is broken where it is entered',
			ids: ['a', 'b', 'c'],
			pairs: [
				['a', 'b'],
				['b', 'c'],
				['c', 'b'],
			],
			expected: { a: 0, b: 1, c: 2 },
		},
		{
			name: 'a cycle with no entry point still gets columns',
			ids: ['x', 'y'],
			pairs: [
				['x', 'y'],
				['y', 'x'],
			],
			expected: { x: 0, y: 1 },
		},
		{
			name: 'isolated nodes and several entry points start at the left',
			ids: ['web', 'api', 'db', 'lonely'],
			pairs: [
				['web', 'db'],
				['api', 'db'],
			],
			expected: { web: 0, api: 0, db: 1, lonely: 0 },
		},
		{
			name: 'self calls are ignored',
			ids: ['a'],
			pairs: [['a', 'a']],
			expected: { a: 0 },
		},
	])('$name', ({ ids, pairs, expected }) => {
		expect(Object.fromEntries(assignLayers(ids, edges(pairs)))).toStrictEqual(
			expected,
		);
	});
});

describe('orderLayers', () => {
	it('orders a column by where its callers sit, so lines do not cross', () => {
		const pairs = edges([
			['a', 'y'],
			['b', 'x'],
		]);
		const layers = new Map([
			['a', 0],
			['b', 0],
			['x', 1],
			['y', 1],
		]);
		const columns = orderLayers(layers, pairs);
		expect(columns).toStrictEqual([
			['a', 'b'],
			['y', 'x'],
		]);
	});
});

describe('layeredLayout', () => {
	it('places columns left to right and centres each one', () => {
		const layout = layeredLayout(
			['a', 'b', 'c'],
			edges([
				['a', 'b'],
				['a', 'c'],
			]),
		);
		const { a, b, c } = layout.positions;
		expect(a.x).toBeLessThan(b.x);
		expect(b.x).toBe(c.x);
		expect(a.y).toBe((b.y + c.y) / 2);
		expect(layout.width).toBeGreaterThan(b.x);
		expect(layout.height).toBeGreaterThan(c.y);
	});

	it('lays out 50 nodes without overlaps', () => {
		const ids = Array.from({ length: 50 }, (_, index) => `s${index}`);
		const pairs = ids
			.slice(1)
			.map((id, index): [string, string] => [ids[Math.floor(index / 3)], id]);
		const { positions } = layeredLayout(ids, edges(pairs));
		const spots = new Set(
			ids.map((id) => `${positions[id].x},${positions[id].y}`),
		);
		expect(spots.size).toBe(50);
	});

	it('is empty without nodes', () => {
		expect(layeredLayout([], [])).toMatchObject({ positions: {} });
	});
});
