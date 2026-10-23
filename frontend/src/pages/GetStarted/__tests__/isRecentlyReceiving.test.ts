import { isRecentlyReceiving } from '../utils';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

describe('isRecentlyReceiving', () => {
	it.each([
		['no status yet', undefined, false],
		['nothing received', { logs: null, metrics: null }, false],
		[
			'logs an hour ago',
			{
				logs: { last_received_ts_ms: NOW - HOUR, last_received_from: 'h' },
				metrics: null,
			},
			true,
		],
		[
			'metrics two days ago',
			{
				logs: null,
				metrics: { last_received_ts_ms: NOW - 48 * HOUR, last_received_from: 'h' },
			},
			false,
		],
	])('%s', (_, status, expected) => {
		expect(isRecentlyReceiving(status, NOW)).toBe(expected);
	});
});
