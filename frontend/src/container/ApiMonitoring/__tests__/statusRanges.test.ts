import {
	STATUS_RANGES,
	statusRangeColors,
	statusRangeOf,
} from '../statusRanges';

describe('statusRangeOf', () => {
	it.each([
		['200', '200-299'],
		['204', '200-299'],
		['301', '300-399'],
		['404', '400-499'],
		['500', '500-599'],
		['503', '500-599'],
		['', 'Other'],
		['n/a', 'Other'],
		['0', 'Other'],
	])('%s is in %s', (code, range) => {
		expect(statusRangeOf(code)).toBe(range);
	});
});

describe('statusRangeColors', () => {
	it.each([true, false])('colours every range (dark: %s)', (isDark) => {
		const colors = statusRangeColors(isDark);
		STATUS_RANGES.forEach(({ key }) => expect(colors[key]).toMatch(/^#/));
	});

	it('reads 5xx as red and 4xx as amber', () => {
		const colors = statusRangeColors(false);
		expect(colors['500-599']).toBe('#dc2626');
		expect(colors['400-499']).toBe('#d97706');
		expect(colors['200-299']).toBe('#059669');
	});
});
