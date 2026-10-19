import { themeColors } from 'constants/theme';
import { generateColor } from 'lib/uPlotLib/utils/generateColor';

import { FS_SERIES_DARK, FS_SERIES_LIGHT } from '../fuseScopeColors';

function hueAndSaturation(hex: string): { hue: number; saturation: number } {
	const n = parseInt(hex.slice(1), 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	const l = (max + min) / 2;
	const saturation = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	let hue = 0;
	if (d !== 0 && max === r) {
		hue = 60 * (((g - b) / d) % 6);
	} else if (d !== 0 && max === g) {
		hue = 60 * ((b - r) / d + 2);
	} else if (d !== 0) {
		hue = 60 * ((r - g) / d + 4);
	}
	return { hue: (hue + 360) % 360, saturation };
}

const isRedBand = (hex: string): boolean => {
	const { hue, saturation } = hueAndSaturation(hex);
	return saturation > 0.2 && (hue < 15 || hue >= 345);
};

const PALETTES = [
	['dark', FS_SERIES_DARK],
	['light', FS_SERIES_LIGHT],
] as const;

describe('FuseScope series palettes', () => {
	it.each(PALETTES)(
		'the %s palette has 20–24 distinct hex colours',
		(_, palette) => {
			const values = Object.values(palette);

			expect(values.length).toBeGreaterThanOrEqual(20);
			expect(values.length).toBeLessThanOrEqual(24);
			expect(new Set(values).size).toBe(values.length);
			values.forEach((value) => expect(value).toMatch(/^#[0-9a-f]{6}$/));
		},
	);

	it.each(PALETTES)('the %s palette leaves red to errors', (_, palette) => {
		expect(Object.values(palette).filter(isRedBand)).toStrictEqual([]);
	});

	it('pairs each dark colour with a light one at the same index', () => {
		expect(Object.keys(FS_SERIES_LIGHT)).toStrictEqual(
			Object.keys(FS_SERIES_DARK),
		);
		expect(Object.values(FS_SERIES_LIGHT)).not.toStrictEqual(
			Object.values(FS_SERIES_DARK),
		);
	});

	it.each([
		[
			'dark',
			FS_SERIES_DARK,
			[
				'#3d8be0',
				'#c04fe0',
				'#059669',
				'#d97706',
				'#9dbbe0',
				'#cf9de0',
				'#8e98a8',
			],
		],
		[
			'light',
			FS_SERIES_LIGHT,
			[
				'#0f5fb8',
				'#950fb8',
				'#059669',
				'#d97706',
				'#6d9ad8',
				'#b86dd8',
				'#64707f',
			],
		],
	] as const)(
		'the %s palette includes the seven design series tokens',
		(_, palette, tokens) => {
			expect(Object.values(palette)).toStrictEqual(
				expect.arrayContaining([...tokens]),
			);
		},
	);

	it.each(PALETTES)(
		'the %s palette jumps across hues in its first slots',
		(_, palette) => {
			const first = Object.values(palette).slice(0, 8).map(hueAndSaturation);
			first.slice(1).forEach(({ hue }, i) => {
				const delta = Math.abs(hue - first[i].hue);
				expect(Math.min(delta, 360 - delta)).toBeGreaterThanOrEqual(30);
			});
			const purpleOrPink = first
				.slice(0, 6)
				.filter(({ hue }) => hue >= 270 && hue < 345);
			expect(purpleOrPink.length).toBeLessThanOrEqual(1);
		},
	);

	it('is what the charts pick from in each theme', () => {
		expect(themeColors.chartcolors).toBe(FS_SERIES_DARK);
		expect(themeColors.lightModeColor).toBe(FS_SERIES_LIGHT);
	});
});

describe('generateColor', () => {
	const KEYS = [
		'frontend',
		'driver',
		'redis-manual',
		'mysql',
		'A',
		'{service.name="payment"}',
	];

	it.each(KEYS)('is deterministic and stays in the palette for %p', (key) => {
		const dark = generateColor(key, themeColors.chartcolors);
		const light = generateColor(key, themeColors.lightModeColor);

		expect(generateColor(key, themeColors.chartcolors)).toBe(dark);
		expect(Object.values(FS_SERIES_DARK)).toContain(dark);
		expect(Object.values(FS_SERIES_LIGHT)).toContain(light);
		expect(isRedBand(dark)).toBe(false);
		expect(isRedBand(light)).toBe(false);
	});

	it('picks the same palette slot in both themes', () => {
		KEYS.forEach((key) => {
			const darkKey = Object.keys(FS_SERIES_DARK).find(
				(k) => FS_SERIES_DARK[k] === generateColor(key, FS_SERIES_DARK),
			);
			expect(generateColor(key, FS_SERIES_LIGHT)).toBe(
				FS_SERIES_LIGHT[darkKey as string],
			);
		});
	});
});
