import { errorMessageRows, errorSummary } from '../errors';

const COUNTS = [
	{ message: 'redis timeout', operation: 'GetDriver', count: 1585 },
	{ message: '', operation: 'GetDriver', count: 13 },
];

describe('errorMessageRows', () => {
	it('shares error spans by status message and matches recorded exception messages', () => {
		const rows = errorMessageRows(COUNTS, ['redis timeout']);
		expect(rows).toStrictEqual([
			{
				key: 'redis timeout|GetDriver',
				message: 'redis timeout',
				operation: 'GetDriver',
				count: 1585,
				share: (1585 / 1598) * 100,
				exception: 'recorded',
			},
			{
				key: '|GetDriver',
				message: '',
				operation: 'GetDriver',
				count: 13,
				share: (13 / 1598) * 100,
				exception: 'unmatched',
			},
		]);
	});

	it('marks every message as status-only when the service recorded no exception', () => {
		expect(
			errorMessageRows(COUNTS, []).map((row) => row.exception),
		).toStrictEqual(['none', 'none']);
	});
});

describe('errorSummary', () => {
	it('splits error spans into exceptions and status-only errors', () => {
		expect(
			errorSummary({
				errorSpans: 1598,
				spans: 8640,
				previousErrorSpans: 516,
				previousSpans: 8320,
				exceptions: 1585,
				exceptionTypes: 1,
			}),
		).toStrictEqual({
			errorSpans: 1598,
			errorRate: (1598 / 8640) * 100,
			previousErrorSpans: 516,
			previousErrorRate: (516 / 8320) * 100,
			withException: 1585,
			statusOnly: 13,
			exceptionTypes: 1,
		});
	});

	it('never counts more exceptions than error spans', () => {
		expect(
			errorSummary({
				errorSpans: 10,
				spans: 20,
				exceptions: 30,
				exceptionTypes: 2,
			}),
		).toStrictEqual(
			expect.objectContaining({ withException: 10, statusOnly: 0 }),
		);
	});
});
