import {
	FS_SERIES_DARK,
	FS_SERIES_FAMILIES,
	FS_SERIES_LIGHT,
} from 'constants/fuseScopeColors';
import { paletteIndex } from 'lib/uPlotLib/utils/generateColor';

import { assignSeriesColors, seriesColorKey } from '../assignSeriesColors';

const familyOf = (palette: Record<string, string>, color: string): string => {
	const key = Object.keys(palette).find((k) => palette[k] === color);
	return FS_SERIES_FAMILIES[key as string];
};

const HOTROD = [
	'{service.name="frontend"}',
	'{service.name="redis-manual"}',
	'{service.name="driver"}',
	'{service.name="mysql"}',
	'{service.name="route"}',
	'{service.name="customer"}',
	'{service.name="payment"}',
	'{service.name="redis"}',
];

const manyLabels = (count: number): string[] =>
	Array.from({ length: count }, (_, i) => `series-${i}`);

const shuffle = (labels: string[]): string[] =>
	labels
		.map((label, i) => ({ label, order: (i * 7919) % labels.length }))
		.sort((a, b) => a.order - b.order)
		.map(({ label }) => label);

const FAMILY_COUNT = new Set(Object.values(FS_SERIES_FAMILIES)).size;

describe('assignSeriesColors', () => {
	describe.each([
		['dark', FS_SERIES_DARK],
		['light', FS_SERIES_LIGHT],
	])('with the %s palette', (_, palette) => {
		it.each([
			['the HotROD services', HOTROD],
			['two series', ['A', 'B']],
			['a full palette', manyLabels(Object.keys(palette).length)],
		])('gives %s distinct colours', (__, labels) => {
			const colors = assignSeriesColors(labels, palette);

			expect(new Set(labels.map((l) => colors[l])).size).toBe(labels.length);
			labels.forEach((l) => expect(Object.values(palette)).toContain(colors[l]));
		});

		it.each([
			['the HotROD services', HOTROD],
			['as many series as families', manyLabels(FAMILY_COUNT)],
		])('does not repeat a hue family for %s', (__, labels) => {
			const colors = assignSeriesColors(labels, palette);
			const families = labels.map((l) => familyOf(palette, colors[l]));

			expect(new Set(families).size).toBe(labels.length);
		});

		it('repeats a family only once every family is used', () => {
			const labels = manyLabels(FAMILY_COUNT + 3);
			const colors = assignSeriesColors(labels, palette);
			const families = labels.map((l) => familyOf(palette, colors[l]));

			expect(new Set(families).size).toBe(FAMILY_COUNT);
		});
	});

	it.each([
		['HotROD services', HOTROD],
		['generic labels', manyLabels(30)],
	])('is deterministic for %s', (_, labels) => {
		expect(assignSeriesColors(labels, FS_SERIES_DARK)).toStrictEqual(
			assignSeriesColors([...labels], FS_SERIES_DARK),
		);
	});

	it.each([
		['reversed', (labels: string[]): string[] => [...labels].reverse()],
		['shuffled', shuffle],
		['duplicated', (labels: string[]): string[] => [...labels, ...labels]],
	])('ignores input order when %s', (_, reorder) => {
		expect(assignSeriesColors(reorder(HOTROD), FS_SERIES_DARK)).toStrictEqual(
			assignSeriesColors(HOTROD, FS_SERIES_DARK),
		);
	});

	it('picks the same slot in both themes', () => {
		const dark = assignSeriesColors(HOTROD, FS_SERIES_DARK);
		const light = assignSeriesColors(HOTROD, FS_SERIES_LIGHT);
		const darkKeys = Object.keys(FS_SERIES_DARK);

		HOTROD.forEach((label) => {
			const slot = darkKeys.find((k) => FS_SERIES_DARK[k] === dark[label]);
			expect(light[label]).toBe(FS_SERIES_LIGHT[slot as string]);
		});
	});

	it('wraps around once every slot is taken', () => {
		const labels = manyLabels(Object.keys(FS_SERIES_DARK).length + 5);
		const colors = assignSeriesColors(labels, FS_SERIES_DARK);

		expect(new Set(Object.values(colors)).size).toBe(
			Object.keys(FS_SERIES_DARK).length,
		);
	});

	it.each([
		[
			'keeps a user colour',
			{ '{service.name="driver"}': '#123456' },
			'{service.name="driver"}',
			'#123456',
		],
		[
			'keeps a user colour that is in the palette',
			{ '{service.name="mysql"}': FS_SERIES_DARK.amber },
			'{service.name="mysql"}',
			FS_SERIES_DARK.amber,
		],
	])('%s', (_, overrides, label, expected) => {
		expect(assignSeriesColors(HOTROD, FS_SERIES_DARK, overrides)[label]).toBe(
			expected,
		);
	});

	it('does not move the other series when a user colour is set', () => {
		const base = assignSeriesColors(HOTROD, FS_SERIES_DARK);
		const overridden = assignSeriesColors(HOTROD, FS_SERIES_DARK, {
			'{service.name="driver"}': '#123456',
		});

		HOTROD.filter((l) => l !== '{service.name="driver"}').forEach((label) =>
			expect(overridden[label]).toBe(base[label]),
		);
	});

	it('colours an override-only label', () => {
		expect(
			assignSeriesColors([], FS_SERIES_DARK, { A: '#123456' }),
		).toStrictEqual({
			A: '#123456',
		});
	});

	it('returns nothing for no series', () => {
		expect(assignSeriesColors([], FS_SERIES_DARK)).toStrictEqual({});
	});

	it('gives a lone service series the colour the trace page gives it', () => {
		const darkKeys = Object.keys(FS_SERIES_DARK);
		['frontend', 'driver', 'mysql'].forEach((service) => {
			const colors = assignSeriesColors(
				[`{service.name="${service}"}`],
				FS_SERIES_DARK,
			);
			expect(colors[`{service.name="${service}"}`]).toBe(
				FS_SERIES_DARK[darkKeys[paletteIndex(service, darkKeys.length)]],
			);
		});
	});

	it('keeps each service on its trace-page colour when slots do not collide', () => {
		const darkKeys = Object.keys(FS_SERIES_DARK);
		const services = ['frontend', 'customer'];
		const slots = services.map((s) => paletteIndex(s, darkKeys.length));
		expect(new Set(slots).size).toBe(services.length);

		const colors = assignSeriesColors(
			services.map((s) => `{service.name="${s}"}`),
			FS_SERIES_DARK,
		);
		services.forEach((service, i) =>
			expect(colors[`{service.name="${service}"}`]).toBe(
				FS_SERIES_DARK[darkKeys[slots[i]]],
			),
		);
	});
});

describe('seriesColorKey', () => {
	it.each([
		['{service.name="frontend"}', 'frontend'],
		['{service_name="frontend"}', 'frontend'],
		['{serviceName="frontend"}', 'frontend'],
		['frontend', 'frontend'],
		[
			'{service.name="frontend",operation="GET"}',
			'{service.name="frontend",operation="GET"}',
		],
		['{host.name="frontend"}', '{host.name="frontend"}'],
		['A-{service.name="frontend"}', 'A-{service.name="frontend"}'],
		['', ''],
	])('keys %p by %p', (label, expected) => {
		expect(seriesColorKey(label)).toBe(expected);
	});
});
