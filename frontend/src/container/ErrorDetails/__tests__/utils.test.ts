import { Exception } from 'types/api/errors/getAll';

import {
	findGroup,
	groupSummaryWindow,
	traceLogsUrl,
	traceUrl,
} from '../utils';

describe('traceLogsUrl', () => {
	it('opens the logs explorer on the trace, 15 minutes either side of the event', () => {
		const url = new URL(
			traceLogsUrl('abc123', '2025-04-14T18:27:57.797616374Z'),
			'http://localhost',
		);
		const query = JSON.parse(url.searchParams.get('compositeQuery') ?? '{}');
		const [logs] = query.builder.queryData;

		expect(url.pathname).toBe('/logs/logs-explorer');
		expect(url.searchParams.get('startTime')).toBe(
			String(Date.parse('2025-04-14T18:12:57.797Z')),
		);
		expect(url.searchParams.get('endTime')).toBe(
			String(Date.parse('2025-04-14T18:42:57.797Z')),
		);
		expect(logs.dataSource).toBe('logs');
		expect(logs.filter).toStrictEqual({ expression: "trace_id = 'abc123'" });
		expect(logs.filters.items).toStrictEqual([
			expect.objectContaining({
				key: expect.objectContaining({ key: 'trace_id' }),
				op: '=',
				value: 'abc123',
			}),
		]);
	});
});

describe('traceUrl', () => {
	it.each([
		['t1', 's1', '/trace/t1?spanId=s1'],
		['t1', '', '/trace/t1'],
	])('links trace %s span %s', (traceId, spanId, expected) => {
		expect(traceUrl(traceId, spanId)).toBe(expected);
	});
});

describe('findGroup', () => {
	const row = (groupID: string): Exception => ({
		groupID,
		exceptionType: 'Error',
		exceptionMessage: 'boom',
		exceptionCount: 3,
		firstSeen: '2025-04-14T18:00:00Z',
		lastSeen: '2025-04-14T18:30:00Z',
		serviceName: 'cart',
	});

	it.each<[string, Exception[] | undefined, string | undefined]>([
		['the matching group', [row('a'), row('b')], 'b'],
		['nothing when the group is not listed', [row('a')], undefined],
		['nothing without rows', undefined, undefined],
	])('returns %s', (_name, rows, expected) => {
		expect(findGroup(rows, 'b')?.groupID).toBe(expected);
	});
});

describe('groupSummaryWindow', () => {
	const at = '2025-04-14T18:00:00Z';
	const atNs = Date.parse(at) * 1e6;

	it.each<[string, number, number, [number, number]]>([
		[
			'keeps a range that holds the event',
			atNs - 10,
			atNs + 10,
			[atNs - 10, atNs + 10],
		],
		[
			'starts at an event older than the range',
			atNs + 10,
			atNs + 20,
			[atNs, atNs + 20],
		],
		[
			'ends at an event newer than the range',
			atNs - 20,
			atNs - 10,
			[atNs - 20, atNs],
		],
	])('%s', (_name, minTime, maxTime, expected) => {
		expect(groupSummaryWindow(minTime, maxTime, at)).toStrictEqual(expected);
	});
});
