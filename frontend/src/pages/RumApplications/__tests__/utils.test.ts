import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import {
	RumtypesPlatformDTO,
	RumtypesSourceMapRetentionDTO,
} from 'api/generated/services/fuseScope.schemas';
import { ApplicationMetrics } from 'lib/rum/metricTypes';

import { ApplicationRow } from '../types';
import { applicationsKpis, environmentsOf, filterApplications } from '../utils';

function app(
	id: string,
	name: string,
	environment: string,
): RumtypesApplicationDTO {
	return {
		id,
		orgId: 'org',
		name,
		environment,
		platform: RumtypesPlatformDTO.web,
		allowedOrigins: [],
		allowedPackageNames: [],
		tracePropagationUrls: [],
		sampleRate: 1,
		createdBy: 'admin',
		firstSeenAt: null,
		sourceMaps: {
			retention: RumtypesSourceMapRetentionDTO['90d'],
			keepNewestReleases: true,
		},
		piiPolicy: {
			dropQuery: true,
			queryAllowlist: [],
			urlAllowlist: [],
			geoLookup: true,
			requireConsent: false,
			hashUserId: true,
		},
	};
}

function metrics(
	sessions: number,
	withErrors: number,
	previous?: [number, number],
	lcp?: [number, number, number],
): ApplicationMetrics {
	return {
		current: { sessions, sessionsWithErrors: withErrors },
		previous: previous && {
			sessions: previous[0],
			sessionsWithErrors: previous[1],
		},
		views: 0,
		vitals: lcp
			? {
					lcp: {
						p75: 1,
						samples: lcp[0] + lcp[1] + lcp[2],
						counts: { good: lcp[0], needsImprovement: lcp[1], poor: lcp[2] },
					},
				}
			: {},
		activity: [],
	};
}

const ROWS: ApplicationRow[] = [
	{
		application: app('a', 'web-shop', 'production'),
		metrics: metrics(900, 18, [800, 8], [70, 20, 10]),
		support: 'supported',
	},
	{
		application: app('b', 'checkout', 'production'),
		metrics: metrics(100, 2, [100, 2], [30, 0, 0]),
		support: 'outdated',
	},
	{ application: app('c', 'admin-portal', 'staging'), support: 'unknown' },
];

describe('applicationsKpis', () => {
	const kpis = applicationsKpis(ROWS);

	it('counts applications by platform', () => {
		expect(kpis).toMatchObject({ applications: 3, web: 3, mobile: 0 });
	});

	it('adds sessions up and takes the error rate over all sessions', () => {
		expect(kpis.sessions).toBe(1000);
		expect(kpis.previousSessions).toBe(900);
		expect(kpis.errorRate).toBe(2);
		expect(kpis.previousErrorRate).toBeCloseTo(1.111, 2);
	});

	it('takes the good LCP share over all page loads', () => {
		expect(kpis.goodLcp).toBeCloseTo(76.923, 2);
	});

	it('lists applications on an outdated SDK', () => {
		expect(kpis.outdated.map((row) => row.application.name)).toStrictEqual([
			'checkout',
		]);
	});

	it('has no rates without data', () => {
		const empty = applicationsKpis([ROWS[2]]);
		expect(empty.errorRate).toBeUndefined();
		expect(empty.goodLcp).toBeUndefined();
		expect(empty.previousSessions).toBeUndefined();
	});
});

describe('filterApplications', () => {
	it.each([
		[{ search: '', platform: 'all', environment: '' }, ['a', 'b', 'c']],
		[{ search: 'SHOP', platform: 'all', environment: '' }, ['a']],
		[{ search: '', platform: 'web', environment: 'staging' }, ['c']],
		[{ search: '', platform: 'android', environment: '' }, []],
	] as const)('%o', (filters, ids) => {
		expect(
			filterApplications(ROWS, filters).map((row) => row.application.id),
		).toStrictEqual(ids);
	});
});

describe('environmentsOf', () => {
	it('lists each environment once, sorted', () => {
		expect(environmentsOf(ROWS)).toStrictEqual(['production', 'staging']);
	});
});
