import { layoutTreemap } from '../treemapLayout';

describe('layoutTreemap', () => {
	it('fills the box with one tile per entry, in proportion to its value', () => {
		const tiles = layoutTreemap(
			[
				{ id: 'a', value: 50 },
				{ id: 'b', value: 30 },
				{ id: 'c', value: 20 },
			],
			{ width: 1000, height: 200 },
		);

		expect(tiles.map((tile) => tile.id).sort()).toStrictEqual(['a', 'b', 'c']);
		const area = tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
		expect(area).toBeCloseTo(1000 * 200);
		const a = tiles.find((tile) => tile.id === 'a');
		expect((a?.width ?? 0) * (a?.height ?? 0)).toBeCloseTo(0.5 * 1000 * 200);
		expect(a?.share).toBeCloseTo(0.5);
	});

	it('splits along the longer side', () => {
		const tiles = layoutTreemap(
			[
				{ id: 'a', value: 1 },
				{ id: 'b', value: 1 },
			],
			{ width: 400, height: 100 },
		);

		expect(tiles[0]).toMatchObject({ x: 0, y: 0, width: 200, height: 100 });
		expect(tiles[1]).toMatchObject({ x: 200, y: 0, width: 200, height: 100 });
	});

	it('skips empty entries and returns nothing for no values', () => {
		expect(layoutTreemap([], { width: 10, height: 10 })).toStrictEqual([]);
		expect(
			layoutTreemap([{ id: 'a', value: 0 }], { width: 10, height: 10 }),
		).toStrictEqual([]);
	});
});
