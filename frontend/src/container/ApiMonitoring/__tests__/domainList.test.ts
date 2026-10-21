import { ScalarData } from 'types/api/v5/queryRange';

import {
	callersByDomain,
	domainNeighbours,
	errorRateTone,
	formatMs,
	isIpAddress,
	sortDomains,
	toDomainRow,
} from '../domainList';
import { APIDomainsRowData } from '../types';

const row = (overrides: Partial<APIDomainsRowData>): APIDomainsRowData => ({
	key: overrides.domainName ?? 'k',
	domainName: 'a.com',
	endpointCount: 1,
	rate: 1,
	errorRate: 0,
	latency: 10,
	lastUsed: '2026-10-21T00:00:00.000Z',
	...overrides,
});

describe('errorRateTone', () => {
	it.each([
		[0, 'success'],
		[0.01, 'warning'],
		[4.99, 'warning'],
		[5, 'error'],
		[100, 'error'],
	])('%s%% is %s', (value, tone) => {
		expect(errorRateTone(value)).toBe(tone);
	});
});

describe('isIpAddress', () => {
	it.each([
		['1.2.3.4', true],
		['10.0.0.1:8080', true],
		['0.0.0.0', true],
		['[2001:db8::1]:443', true],
		['2001:db8::1', true],
		['route:8083', false],
		['api.example.com', false],
		['telemetrygen-server', false],
		['1.2.3', false],
	])('%s → %s', (domain, expected) => {
		expect(isIpAddress(domain)).toBe(expected);
	});
});

describe('toDomainRow', () => {
	it('reads numbers out of the formatted table row', () => {
		expect(
			toDomainRow(
				row({
					domainName: 'x.com',
					endpointCount: '3',
					rate: '0.5',
					errorRate: '12.5',
					latency: 250,
					lastUsed: '2026-10-21T00:00:00.000Z',
				}),
			),
		).toStrictEqual({
			domain: 'x.com',
			endpoints: 3,
			rate: 0.5,
			errorRate: 12.5,
			p99Ms: 250,
			lastUsedMs: Date.parse('2026-10-21T00:00:00.000Z'),
			isIp: false,
		});
	});

	it('leaves missing values undefined', () => {
		expect(
			toDomainRow(
				row({ domainName: '1.2.3.4', rate: '-', latency: '-', lastUsed: '-' }),
			),
		).toMatchObject({
			isIp: true,
			rate: undefined,
			p99Ms: undefined,
			lastUsedMs: undefined,
		});
	});
});

describe('sortDomains', () => {
	const rows = [
		toDomainRow(row({ domainName: 'b', errorRate: 0, rate: 5 })),
		toDomainRow(row({ domainName: 'a', errorRate: 100, rate: 1 })),
		toDomainRow(row({ domainName: 'c', errorRate: 100, rate: 2, latency: '-' })),
	];

	it('sorts by error rate, then by rate', () => {
		expect(
			sortDomains(rows, { key: 'errorRate', direction: 'desc' }).map(
				(r) => r.domain,
			),
		).toStrictEqual(['c', 'a', 'b']);
	});

	it('puts missing values last in either direction', () => {
		expect(
			sortDomains(rows, { key: 'p99Ms', direction: 'asc' }).map((r) => r.domain),
		).toStrictEqual(['b', 'a', 'c']);
		expect(
			sortDomains(rows, { key: 'p99Ms', direction: 'desc' }).map((r) => r.domain),
		).toStrictEqual(['b', 'a', 'c']);
	});
});

describe('callersByDomain', () => {
	const scalar = (data: unknown[][]): ScalarData =>
		({
			queryName: 'A',
			columns: [
				{ name: 'http_host', columnType: 'group' },
				{ name: 'service.name', columnType: 'group' },
				{ name: '__result_0', columnType: 'aggregation' },
			],
			data,
		}) as unknown as ScalarData;

	it('lists the calling services of each domain, busiest first', () => {
		const callers = callersByDomain(
			scalar([
				['api.com', 'frontend', 10],
				['api.com', 'payment', 40],
				['1.2.3.4', 'payment', 3],
			]),
		);

		expect(callers.get('api.com')).toStrictEqual(['payment', 'frontend']);
		expect(callers.get('1.2.3.4')).toStrictEqual(['payment']);
	});

	it('is empty without a result', () => {
		expect(callersByDomain(undefined).size).toBe(0);
	});
});

describe('domainNeighbours', () => {
	const list = ['a', 'b', 'c'];

	it.each([
		['a', undefined, 'b'],
		['b', 'a', 'c'],
		['c', 'b', undefined],
		['z', undefined, undefined],
	])('around %s', (domain, previous, next) => {
		expect(domainNeighbours(list, domain)).toStrictEqual({ previous, next });
	});
});

describe('formatMs', () => {
	it.each([
		[undefined, '—'],
		[0, '0 ms'],
		[0.456, '0.46 ms'],
		[4.2, '4.2 ms'],
		[250.4, '250 ms'],
		[1250, '1,250 ms'],
		[61000, '61,000 ms'],
	])('%s → %s', (value, expected) => {
		expect(formatMs(value)).toBe(expected);
	});
});
