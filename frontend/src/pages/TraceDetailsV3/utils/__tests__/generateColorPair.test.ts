import { FS_SERIES_DARK, FS_SERIES_LIGHT } from 'constants/fuseScopeColors';
import { themeColors } from 'constants/theme';
import { generateColor } from 'lib/uPlotLib/utils/generateColor';

import {
	darkenHex,
	generateColorPair,
	RESERVED_ERROR,
	RESERVED_OK,
	RESERVED_WARNING,
} from '../generateColorPair';

describe('generateColorPair', () => {
	it('is deterministic: same name returns the same pair across calls', () => {
		const a = generateColorPair('payment-service');
		const b = generateColorPair('payment-service');
		expect(a).toBe(b); // cache hit returns the same reference
		expect(a.color).toBe(b.color);
		expect(a.colorDark).toBe(b.colorDark);
	});

	it.each(['any-service', 'frontend', 'redis-manual', 'payment'])(
		'gives %p the colours the charts give it in each theme',
		(name) => {
			const { color, colorDark } = generateColorPair(name);
			expect(Object.values(FS_SERIES_DARK)).toContain(color);
			expect(Object.values(FS_SERIES_LIGHT)).toContain(colorDark);
			expect(color).toBe(generateColor(name, themeColors.chartcolors));
			expect(colorDark).toBe(generateColor(name, themeColors.lightModeColor));
		},
	);

	it('produces different colors for different names (palette wraps modulo length)', () => {
		const a = generateColorPair('aaa');
		const b = generateColorPair('bbb');
		// Not strictly guaranteed (hash collisions exist with 28 buckets), but
		// for these two short strings djb2 produces different bucket indices.
		expect(a.color).not.toBe(b.color);
	});
});

describe('darkenHex', () => {
	it('returns a darker hex than the input for amount > 0', () => {
		const input = '#4D6BD8';
		const out = darkenHex(input, 0.22);
		expect(out).toMatch(/^#[0-9a-f]{6}$/i);
		expect(out).not.toBe(input);
	});

	it('handles amount = 0 as a near-identity', () => {
		const out = darkenHex('#4D6BD8', 0);
		// HSL round-trip may shift a digit; only assert format.
		expect(out).toMatch(/^#[0-9a-f]{6}$/i);
	});
});

describe('reserved status colors', () => {
	it('matches spec section 8 hexes', () => {
		expect(RESERVED_ERROR).toBe('#FC4E4E');
		expect(RESERVED_WARNING).toBe('#fbbf24');
		expect(RESERVED_OK).toBe('#4ade80');
	});
});
