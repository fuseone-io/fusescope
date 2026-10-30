/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import type {
	RumtypesApplicationDTO,
	RumtypesGettableApplicationKeyDTO,
	RumtypesGettableApplicationStatusDTO,
} from 'api/generated/services/fuseScope.schemas';
import {
	RumtypesKeyStatusDTO,
	RumtypesPlatformDTO,
	RumtypesSourceMapRetentionDTO,
	RumtypesRejectionReasonDTO,
	RumtypesSDKSupportDTO,
} from 'api/generated/services/fuseScope.schemas';

const APP = 'fusescope.rum.application.id';
const VITAL = 'browser.web_vital.name';
const ROUTE = 'fusescope.rum.view.route';
const SDK = '@fusescope/browser';
const MINUTE = 60_000;

const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

export function rumApplication(
	overrides: Partial<RumtypesApplicationDTO>,
): RumtypesApplicationDTO {
	return {
		id: 'app-web-shop',
		orgId: 'org-1',
		name: 'web-shop',
		platform: RumtypesPlatformDTO.web,
		environment: 'production',
		allowedOrigins: ['https://shop.example.com', 'https://www.shop.example.com'],
		allowedPackageNames: [],
		tracePropagationUrls: ['https://api.shop.example.com'],
		sampleRate: 1,
		createdBy: 'admin@fusescope.local',
		createdAt: '2026-06-02T14:05:00Z',
		updatedAt: '2026-06-02T14:05:00Z',
		firstSeenAt: '2026-06-02T14:07:21Z',
		sourceMaps: {
			retention: RumtypesSourceMapRetentionDTO['90d'],
			keepNewestReleases: true,
		},
		piiPolicy: {
			dropQuery: true,
			queryAllowlist: ['utm_source', 'utm_campaign', 'page'],
			urlAllowlist: [],
			geoLookup: true,
			requireConsent: false,
			hashUserId: true,
		},
		...overrides,
	};
}

/** web-shop is healthy, checkout fails often, admin-portal runs an old SDK. */
export const RUM_APPLICATIONS: RumtypesApplicationDTO[] = [
	rumApplication({}),
	rumApplication({
		id: 'app-checkout',
		name: 'checkout',
		allowedOrigins: ['https://checkout.example.com'],
		sampleRate: 0.5,
	}),
	rumApplication({
		id: 'app-admin-portal',
		name: 'admin-portal',
		environment: 'staging',
		allowedOrigins: ['https://admin.example.com'],
	}),
];

interface AppFixture {
	sessions: number;
	previous: number;
	errorSessions: number;
	previousErrorSessions: number;
	views: number;
	lastSeenMs: number;
	version: string;
	/** p75 and good / needs-improvement / poor counts per vital. */
	vitals: Record<string, [number, number, number, number]>;
}

const APP_FIXTURES: Record<string, AppFixture> = {
	'app-web-shop': {
		sessions: 48_210,
		previous: 45_480,
		errorSessions: 868,
		previousErrorSessions: 773,
		views: 212_904,
		lastSeenMs: 8_000,
		version: '0.1.0',
		vitals: {
			lcp: [2140, 7800, 1500, 700],
			inp: [180, 8200, 1300, 500],
			cls: [0.04, 9100, 600, 300],
		},
	},
	'app-checkout': {
		sessions: 9840,
		previous: 9553,
		errorSessions: 453,
		previousErrorSessions: 201,
		views: 30_112,
		lastSeenMs: 21_000,
		version: '0.1.0',
		vitals: {
			lcp: [3180, 500, 380, 120],
			inp: [260, 520, 400, 80],
			cls: [0.02, 950, 30, 20],
		},
	},
	'app-admin-portal': {
		sessions: 612,
		previous: 695,
		errorSessions: 4,
		previousErrorSessions: 6,
		views: 1904,
		lastSeenMs: 3 * MINUTE,
		version: '0.0.3',
		vitals: {
			lcp: [4620, 120, 180, 300],
			inp: [140, 520, 60, 20],
			cls: [0.31, 200, 150, 250],
		},
	},
};

export const RUM_SUPPORTED_SDKS = [
	{ name: SDK, minVersion: '0.1.0', maxVersion: '1.0.0' },
];

interface QuerySpec {
	name?: string;
	filter?: { expression?: string };
}

interface QueryEnvelope {
	spec?: QuerySpec;
}

const scalar = (
	queryName: string,
	groups: string[],
	data: unknown[][],
): unknown => {
	const width = data.length > 0 ? data[0].length - groups.length : 1;
	return {
		queryName,
		columns: [
			...groups.map((name) => ({ name, queryName, columnType: 'group' })),
			...Array.from({ length: width }, (_, index) => ({
				name: `__result_${index}`,
				queryName,
				aggregationIndex: index,
				columnType: 'aggregation',
			})),
		],
		data,
	};
};

function listResult(spec: QuerySpec, ids: string[]): unknown {
	const name = spec.name ?? '';
	const apps = ids.flatMap((id) =>
		APP_FIXTURES[id] ? [[id, APP_FIXTURES[id]] as const] : [],
	);
	switch (name) {
		case 'S':
			return scalar(
				name,
				[APP],
				apps.map(([id, f]) => [id, f.sessions, f.views, ago(f.lastSeenMs)]),
			);
		case 'SP':
			return scalar(
				name,
				[APP],
				apps.map(([id, f]) => [id, f.previous]),
			);
		case 'E':
			return scalar(
				name,
				[APP],
				apps.map(([id, f]) => [id, f.errorSessions]),
			);
		case 'EP':
			return scalar(
				name,
				[APP],
				apps.map(([id, f]) => [id, f.previousErrorSessions]),
			);
		case 'V':
			return scalar(
				name,
				[APP, VITAL],
				apps.flatMap(([id, f]) =>
					Object.entries(f.vitals).map(([vital, v]) => [id, vital, ...v]),
				),
			);
		case 'K':
			return scalar(
				name,
				[APP, 'telemetry.distro.name', 'telemetry.distro.version'],
				apps.map(([id, f]) => [id, SDK, f.version, ago(f.lastSeenMs)]),
			);
		default:
			return scalar(name, [], []);
	}
}

function activitySeries(ids: string[]): unknown {
	const now = Date.now();
	return {
		queryName: 'A',
		aggregations: [
			{
				index: 0,
				series: ids
					.filter((id) => APP_FIXTURES[id])
					.map((id, offset) => ({
						labels: [{ key: { name: APP }, value: id }],
						values: Array.from({ length: 24 }, (_, hour) => ({
							timestamp: now - (24 - hour) * 60 * MINUTE,
							value: Math.round(
								(APP_FIXTURES[id].sessions / 24) *
									(0.55 + 0.45 * Math.sin(((hour + offset * 3) / 24) * Math.PI * 2)),
							),
						})),
					})),
			},
		],
	};
}

type RouteFixture = [
	string,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];

const ROUTES: RouteFixture[] = [
	// route, lcp p75, good, ni, poor (%), inp, cls, errors, page loads
	['/product/:id', 3420, 52, 31, 17, 210, 0.08, 412, 61_204],
	['/search', 2880, 64, 24, 12, 240, 0.03, 121, 28_930],
	['/cart', 2610, 71, 20, 9, 190, 0.02, 96, 14_320],
	['/category/:slug', 2240, 77, 16, 7, 170, 0.12, 38, 33_118],
	['/', 1980, 83, 12, 5, 150, 0.04, 44, 52_870],
	['/account/orders', 1640, 88, 9, 3, 130, 0.01, 9, 6204],
	['/help/:article', 1220, 93, 5, 2, 90, 0.02, 0, 3110],
];

const share = (loads: number, percent: number): number =>
	Math.round((loads * percent) / 100);

export const RUM_SESSIONS: [string, number, number, number, string, string][] =
	[
		// id, started ago, duration, views, user agent, release
		[
			'7f3ac9d04b1e4a6f9e2b5c8d1a07c21e',
			2 * MINUTE,
			372_000,
			9,
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
			'1.8.0',
		],
		[
			'2b91f0a7c3d84e5b8f61a29c4d3be07d',
			3 * MINUTE,
			160_000,
			4,
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
			'1.8.0',
		],
		[
			'c4d0527e1f9b4c3a8d6e0b2f7c519a13',
			5 * MINUTE,
			665_000,
			17,
			'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
			'1.8.0',
		],
		[
			'91ee6b38a2c74d0f9b5e1a6c8d374f02',
			7 * MINUTE,
			48_000,
			1,
			'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
			'1.7.4',
		],
		[
			'5a77d2c9e8f14b6a9c3d7e0f1b25b3c8',
			11 * MINUTE,
			271_000,
			6,
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
			'1.8.0',
		],
		[
			'e810a4f3b7c24e9d8a1f5c6b0e936d59',
			13 * MINUTE,
			75_000,
			3,
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
			'1.8.0',
		],
	];

function overviewResult(spec: QuerySpec, empty: boolean): unknown {
	const name = spec.name ?? '';
	const f = APP_FIXTURES['app-web-shop'];
	if (empty) {
		return scalar(name, [], []);
	}
	switch (name) {
		case 'S':
			return scalar(name, [], [[f.sessions, f.views]]);
		case 'SP':
			return scalar(name, [], [[f.previous]]);
		case 'E':
			return scalar(name, [], [[f.errorSessions]]);
		case 'EP':
			return scalar(name, [], [[f.previousErrorSessions]]);
		case 'V':
			return scalar(
				name,
				[VITAL],
				Object.entries(f.vitals).map(([vital, v]) => [vital, ...v]),
			);
		case 'R':
			return scalar(
				name,
				[ROUTE, VITAL],
				ROUTES.flatMap(([route, lcp, good, ni, poor, inp, cls, , loads]) => [
					[
						route,
						'lcp',
						lcp,
						share(loads, good),
						share(loads, ni),
						share(loads, poor),
					],
					[route, 'inp', inp, 80, 15, 5],
					[route, 'cls', cls, 90, 7, 3],
				]),
			);
		case 'RE':
			return scalar(
				name,
				[ROUTE],
				ROUTES.map(([route, , , , , , , errors]) => [route, errors]),
			);
		case 'SS':
			return scalar(
				name,
				['session.id', 'user_agent.original', 'service.version'],
				RUM_SESSIONS.map(([id, at, duration, views, ua, release]) => [
					id,
					ua,
					release,
					ago(at),
					ago(at - duration),
					views,
				]),
			);
		case 'SE':
			return scalar(
				name,
				['session.id'],
				[
					[RUM_SESSIONS[0][0], 1],
					[RUM_SESSIONS[3][0], 1],
				],
			);
		case 'K':
			return scalar(
				name,
				[APP, 'telemetry.distro.name', 'telemetry.distro.version'],
				[['app-web-shop', SDK, f.version, ago(f.lastSeenMs)]],
			);
		case 'RL':
			return scalar(
				name,
				['service.version'],
				[
					['1.8.0', 900],
					['1.7.4', 40],
				],
			);
		default:
			return scalar(name, [], []);
	}
}

const REQUESTS: [number, string, string, number, number, boolean][] = [
	// session, method, path, status, duration ms, failed
	[0, 'POST', '/api/cart', 502, 312, true],
	[1, 'GET', '/api/products/1234', 200, 1240, false],
	[2, 'GET', '/api/search', 200, 380, false],
	[4, 'POST', '/api/checkout', 200, 640, false],
	[5, 'GET', '/api/cart', 200, 96, false],
];

function requestRows(): unknown {
	return {
		queryName: 'RQ',
		nextCursor: '',
		rows: REQUESTS.map(([session, method, path, status, ms, failed], index) => ({
			timestamp: ago(MINUTE),
			data: {
				'session.id': RUM_SESSIONS[session][0],
				trace_id: `4bf92f3577b34da6a3ce929d0e0e47${String(index).padStart(2, '0')}`,
				span_id: `00f067aa0ba902b${index}`,
				name: `HTTP ${method}`,
				duration_nano: ms * 1e6,
				has_error: failed,
				'http.request.method': method,
				'http.response.status_code': String(status),
				'url.full': `https://api.shop.example.com${path}`,
			},
		})),
	};
}

const ids = (spec: QuerySpec): string[] => {
	const expression = spec.filter?.expression ?? '';
	return Object.keys(APP_FIXTURES).filter((id) =>
		expression.includes(`'${id}'`),
	);
};

/**
 * Answers the RUM pages' v5 query_range requests by query name: the list's
 * per-application totals and activity, and one application's overview.
 */
export function rumQueryRangeResponse(
	body: unknown,
	empty = false,
): Record<string, unknown> {
	const request = body as {
		requestType?: string;
		compositeQuery?: { queries?: QueryEnvelope[] };
	};
	const queries = (request.compositeQuery?.queries ?? []).map(
		(query) => query.spec ?? {},
	);
	const overview = queries.some(
		(spec) => spec.name === 'R' || spec.name === 'SE' || spec.name === 'RQ',
	);
	let results: unknown[];
	if (request.requestType === 'raw') {
		results = [empty ? { queryName: 'RQ', rows: [] } : requestRows()];
	} else if (request.requestType === 'time_series') {
		results = [activitySeries(empty ? [] : ids(queries[0] ?? {}))];
	} else if (overview) {
		results = queries.map((spec) => overviewResult(spec, empty));
	} else {
		results = queries.map((spec) => listResult(spec, empty ? [] : ids(spec)));
	}
	return {
		status: 'success',
		data: { type: request.requestType, data: { results } },
	};
}

export function rumApplicationKeys(
	rotating: boolean,
): RumtypesGettableApplicationKeyDTO[] {
	const active: RumtypesGettableApplicationKeyDTO = {
		id: 'key-active',
		applicationId: 'app-web-shop',
		last4: 'x4fa',
		status: RumtypesKeyStatusDTO.active,
		createdAt: ago(3 * 60 * MINUTE),
		expiresAt: null,
		lastUsedAt: ago(MINUTE),
	};
	if (!rotating) {
		return [active];
	}
	return [
		active,
		{
			id: 'key-expiring',
			applicationId: 'app-web-shop',
			last4: '3cud',
			status: RumtypesKeyStatusDTO.expiring,
			createdAt: ago(30 * 24 * 60 * MINUTE),
			expiresAt: new Date(Date.now() + 23 * 60 * MINUTE).toISOString(),
			lastUsedAt: ago(MINUTE),
		},
	];
}

export function rumApplicationStatus(
	receiving: boolean,
): RumtypesGettableApplicationStatusDTO {
	return {
		firstSeenAt: receiving ? ago(4 * MINUTE) : null,
		windowSeconds: 300,
		counts: receiving
			? { sessions: 3, views: 14, errors: 1, vitals: 22 }
			: { sessions: 0, views: 0, errors: 0, vitals: 0 },
		sdk: receiving
			? { name: SDK, version: '0.1.0', support: RumtypesSDKSupportDTO.supported }
			: { name: '', version: '', support: RumtypesSDKSupportDTO.unknown },
		supportedSdks: RUM_SUPPORTED_SDKS,
		browserBundle: {
			name: SDK,
			version: '0.2.0-beta.1',
			integrity:
				'sha384-W9beoX1Dd3K5Qeu+f2RfXYn3RF/Z5NSY/TUye/4XmIr7RUnT23UwZSqyiY3UWDAs',
			path: '/rum/v1/sdk/browser/0.2.0-beta.1/fusescope.min.js',
		},
		rejections: [
			{
				reason: RumtypesRejectionReasonDTO.origin_not_allowed,
				count: 2,
				lastOrigin: 'http://localhost:5173',
				lastSeenAt: ago(MINUTE),
			},
			{
				reason: RumtypesRejectionReasonDTO.unknown_key,
				count: 5,
				lastOrigin: 'https://shop.example.com',
				lastSeenAt: ago(2 * MINUTE),
			},
		],
	};
}
