import { formatMeterValue } from '../Breakdown/formatMeterValue';

describe('formatMeterValue', () => {
	it.each([
		[0, 'short', { value: '0', unit: '' }],
		[412_000_000, 'short', { value: '412', unit: 'Mil' }],
		[1536, 'bytes', { value: '1.5', unit: 'KiB' }],
	])('%s %s', (value, unit, expected) => {
		expect(formatMeterValue(value, unit)).toStrictEqual(expected);
	});
});
