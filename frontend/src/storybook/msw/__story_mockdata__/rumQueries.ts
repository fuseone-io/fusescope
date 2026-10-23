/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import type {
	RumtypesGettableSessionDTO,
	RumtypesGettableSessionsDTO,
	RumtypesGettableViewDTO,
	RumtypesGettableViewsDTO,
	RumtypesSessionViewDTO,
	RumtypesTimelineEventDTO,
	RumtypesViewRouteDTO,
	RumtypesVitalSummaryDTO,
} from 'api/generated/services/fuseScope.schemas';
import {
	RumtypesLoadingTypeDTO,
	RumtypesTimelineEventKindDTO,
	RumtypesVitalNameDTO,
	RumtypesVitalRatingDTO,
} from 'api/generated/services/fuseScope.schemas';

const HOUR = 3_600_000;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

function vital(
	name: RumtypesVitalNameDTO,
	p75: number,
	[good, needsImprovement, poor]: [number, number, number],
	samples = 1000,
): RumtypesVitalSummaryDTO {
	return {
		name,
		p75,
		samples,
		good: Math.round((samples * good) / 100),
		needsImprovement: Math.round((samples * needsImprovement) / 100),
		poor: Math.round((samples * poor) / 100),
	};
}

type RouteRow = [
	route: string,
	pageLoads: number,
	routeChanges: number,
	lcp: [number, [number, number, number]] | null,
	inp: number,
	cls: number,
	timeOnViewMs: number,
	errors: number,
	request: [string, string, number],
];

const ROUTES: RouteRow[] = [
	[
		'/product/:id',
		61204,
		88410,
		[3420, [52, 31, 17]],
		210,
		0.08,
		64_000,
		412,
		['GET', '/api/products/:id', 1240],
	],
	[
		'/search',
		28930,
		71240,
		[2880, [64, 24, 12]],
		240,
		0.03,
		48_000,
		121,
		['GET', '/api/search', 640],
	],
	[
		'/cart',
		14320,
		39870,
		[2610, [71, 20, 9]],
		190,
		0.02,
		72_000,
		96,
		['POST', '/api/cart', 312],
	],
	[
		'/category/:slug',
		33118,
		41022,
		[2240, [77, 16, 7]],
		170,
		0.12,
		36_000,
		38,
		['GET', '/api/categories/:slug', 520],
	],
	[
		'/',
		52870,
		9310,
		[1980, [83, 12, 5]],
		150,
		0.04,
		22_000,
		44,
		['GET', '/api/home/featured', 420],
	],
	[
		'/checkout',
		0,
		12410,
		null,
		260,
		0.05,
		101_000,
		31,
		['POST', '/api/checkout', 640],
	],
	[
		'/account/orders',
		6204,
		7410,
		[1640, [88, 9, 3]],
		130,
		0.01,
		28_000,
		9,
		['GET', '/api/orders', 210],
	],
];

function viewRoute(
	[
		route,
		pageLoads,
		routeChanges,
		lcp,
		inp,
		cls,
		timeOnView,
		errors,
		request,
	]: RouteRow,
	unknownLoads: number,
): RumtypesViewRouteDTO {
	return {
		route,
		views: pageLoads + routeChanges + unknownLoads,
		pageLoads,
		routeChanges,
		unknownLoads,
		medianTimeOnViewMs: timeOnView,
		errors,
		lcp: lcp ? vital(RumtypesVitalNameDTO.lcp, lcp[0], lcp[1]) : null,
		inp: vital(RumtypesVitalNameDTO.inp, inp, [74, 19, 7]),
		cls: vital(
			RumtypesVitalNameDTO.cls,
			cls,
			cls > 0.1 ? [61, 27, 12] : [92, 6, 2],
		),
		slowestRequest: {
			method: request[0],
			host: 'api.shop.example.com',
			path: request[1],
			p75Ms: request[2],
			calls: 9800,
		},
	};
}

/** web-shop's routes; `oldSdk` adds views without a loading type. */
export function rumViews(
	empty: boolean,
	oldSdk = false,
): RumtypesGettableViewsDTO {
	return {
		routes: empty
			? []
			: ROUTES.map((row, index) =>
					viewRoute(row, oldSdk ? 1200 - index * 100 : 0),
				),
		sessions: empty ? 0 : 48_620,
	};
}

const LCP_SERIES = [
	2710, 2650, 2600, 2580, 2550, 2600, 2680, 2740, 2800, 2770, 2720, 2690, 2750,
	2820, 2790, 2860, 2900, 2840, 2950, 3380, 3460, 3520, 3410, 3420,
];

function series(
	values: number[],
	scale = 1,
): { timestamp: string; p75: number; samples: number }[] {
	return values.map((value, index) => ({
		timestamp: ago((values.length - index) * HOUR),
		p75: value * scale,
		samples: 120,
	}));
}

export function rumView(route: string): RumtypesGettableViewDTO {
	const row = ROUTES.find((candidate) => candidate[0] === route) ?? ROUTES[0];
	const base = viewRoute(row, 0);
	return {
		route: base.route,
		views: base.views,
		pageLoads: base.pageLoads,
		routeChanges: base.routeChanges,
		unknownLoads: 0,
		medianTimeOnViewMs: base.medianTimeOnViewMs,
		errors: base.errors,
		examplePaths:
			route === '/product/:id' ? ['/product/88213', '/product/90417'] : [route],
		vitals: [
			base.lcp,
			base.inp,
			base.cls,
			vital(RumtypesVitalNameDTO.fcp, 1210, [80, 15, 5]),
			vital(RumtypesVitalNameDTO.ttfb, 380, [90, 8, 2]),
		],
		series: {
			stepSeconds: 3600,
			vitals: [
				{ name: RumtypesVitalNameDTO.lcp, points: series(LCP_SERIES) },
				{ name: RumtypesVitalNameDTO.inp, points: series(LCP_SERIES, 0.07) },
				{ name: RumtypesVitalNameDTO.cls, points: series(LCP_SERIES, 0.00003) },
			],
		},
		releases: [
			{ release: '1.7.4', firstSeenAt: ago(30 * 24 * HOUR) },
			{ release: '1.8.0', firstSeenAt: ago(5 * HOUR) },
		],
		slowRequests: [
			{
				method: 'GET',
				host: 'api.shop.example.com',
				path: '/api/products/:id',
				p75Ms: 1240,
				calls: 61900,
				failed: 124,
				exampleTraceId: '4bf92f3577b34da6a3ce929d0e0e4736',
				backendService: 'catalog',
			},
			{
				method: 'GET',
				host: 'api.shop.example.com',
				path: '/api/products/:id/recommendations',
				p75Ms: 860,
				calls: 58200,
				failed: 58,
				exampleTraceId: '5c0a8e1f2d3b4c5d6e7f8091a2b3c4d5',
				backendService: 'recommendation',
			},
			{
				method: 'POST',
				host: 'api.shop.example.com',
				path: '/api/cart',
				p75Ms: 312,
				calls: 9800,
				failed: 186,
				exampleTraceId: '6d1b9f2e3c4d5e6f708192a3b4c5d6e7',
				backendService: 'cart-api',
			},
			{
				method: 'GET',
				host: 'cdn.shop.example.com',
				path: '/media/:name',
				p75Ms: 980,
				calls: 61200,
				failed: 0,
				exampleTraceId: '',
				backendService: '',
			},
		],
		browsers: [
			{ name: 'Chrome 130', views: 70000, pageLoads: 31800, lcpP75Ms: 3100 },
			{ name: 'Safari 18', views: 40000, pageLoads: 17100, lcpP75Ms: 4300 },
			{ name: 'Firefox 131', views: 8000, pageLoads: 3100, lcpP75Ms: 2900 },
			{ name: 'Edge 130', views: 6000, pageLoads: 2400, lcpP75Ms: 2800 },
		],
		operatingSystems: [
			{ name: 'Windows 10', views: 52000, pageLoads: 23200, lcpP75Ms: 3000 },
			{ name: 'iOS 18', views: 40000, pageLoads: 17100, lcpP75Ms: 4300 },
			{ name: 'macOS 15.1', views: 18000, pageLoads: 8000, lcpP75Ms: 2700 },
			{ name: 'Linux', views: 6000, pageLoads: 3000, lcpP75Ms: 2600 },
		],
		recentSessions: RUM_SESSION_LIST.slice(0, 5).map((session, index) => ({
			sessionId: session.sessionId,
			startedAt: session.startedAt,
			loadingType:
				index % 2
					? RumtypesLoadingTypeDTO.route_change
					: RumtypesLoadingTypeDTO.initial_load,
			lcpMs: index % 2 ? null : 2210 + index * 900,
			errors: session.errors,
			client: session.client,
		})),
	};
}

type SessionRow = [
	id: string,
	previous: string,
	user: string,
	startMin: number,
	durationS: number,
	views: number,
	actions: number,
	errors: number,
	browser: string,
	browserVersion: string,
	os: string,
	osVersion: string,
	release: string,
];

const SESSIONS: SessionRow[] = [
	[
		'7f3ac9d04b1e4a6f9e2b5c8d1a07c21e',
		'3a01f2c4d5e6f708192a3b4c5d6e88b0',
		'usr_9f2c88a141ab',
		6,
		372,
		9,
		14,
		1,
		'Chrome',
		'130',
		'Windows',
		'10',
		'1.8.0',
	],
	[
		'2b91f0a7c3d84e5b8f61a29c4d3be07d',
		'',
		'',
		7,
		160,
		4,
		6,
		0,
		'Safari',
		'18',
		'iOS',
		'18',
		'1.8.0',
	],
	[
		'a1c3e58b0d2f4e9a8c71b6d3e5f077f0',
		'',
		'usr_04ae7c119b2c',
		9,
		198,
		5,
		7,
		1,
		'Chrome',
		'130',
		'Android',
		'14',
		'1.8.0',
	],
	[
		'c4d0527e1f9b4c3a8d6e0b2f7c519a13',
		'',
		'',
		10,
		665,
		17,
		31,
		0,
		'Firefox',
		'131',
		'Linux',
		'',
		'1.8.0',
	],
	[
		'91ee6b38a2c74d0f9b5e1a6c8d374f02',
		'5d2a90b1c2d3e4f5a6b7c8d9e0f1c1e3',
		'',
		12,
		48,
		1,
		0,
		1,
		'Chrome',
		'129',
		'Android',
		'14',
		'1.7.4',
	],
	[
		'0d2e71c49f3a4b8e9d1c6a2f7b80a4c9',
		'',
		'usr_b71d33a90f56',
		13,
		302,
		4,
		9,
		2,
		'Safari',
		'18',
		'iOS',
		'18',
		'1.8.0',
	],
	[
		'5a77d2c9e8f14b6a9c3d7e0f1b25b3c8',
		'',
		'',
		15,
		271,
		6,
		11,
		0,
		'Edge',
		'130',
		'Windows',
		'11',
		'1.8.0',
	],
	[
		'e810a4f3b7c24e9d8a1f5c6b0e936d59',
		'',
		'',
		17,
		75,
		3,
		2,
		0,
		'Safari',
		'18',
		'macOS',
		'15.1',
		'1.8.0',
	],
];

export const RUM_SESSION_LIST = SESSIONS.map(
	([
		sessionId,
		previousSessionId,
		userId,
		startMin,
		durationS,
		views,
		actions,
		errors,
		browser,
		browserVersion,
		os,
		osVersion,
		release,
	]) => ({
		sessionId,
		previousSessionId,
		userId,
		startedAt: ago(startMin * 60_000),
		endedAt: ago(startMin * 60_000 - durationS * 1000),
		durationMs: durationS * 1000,
		views,
		actions,
		errors,
		client: { browser, browserVersion, os, osVersion },
		release,
		environment: 'production',
	}),
);

/** One page of sessions; `withErrors` keeps those with an error. */
export function rumSessions(params: {
	hasError?: boolean;
	empty?: boolean;
	total?: number;
}): RumtypesGettableSessionsDTO {
	const sessions = params.empty
		? []
		: RUM_SESSION_LIST.filter(
				(session) => !params.hasError || session.errors > 0,
			);
	return { sessions, total: params.total ?? sessions.length };
}

type EventRow = [
	atS: number,
	kind: 'request' | 'click' | 'action' | 'error' | 'vital',
	title: string,
	detail?: string,
	status?: number,
	durationMs?: number,
];

const VIEWS: [
	route: string,
	path: string,
	loading: RumtypesLoadingTypeDTO,
	startS: number,
	durationS: number,
	events: EventRow[],
][] = [
	[
		'/',
		'/',
		RumtypesLoadingTypeDTO.initial_load,
		0,
		22.4,
		[
			[0.21, 'vital', 'ttfb', 'good', 0, 210],
			[0.31, 'request', 'GET /api/home/featured', 'catalog', 200, 180],
			[0.9, 'vital', 'fcp', 'good', 0, 900],
			[1.82, 'vital', 'lcp', 'good', 0, 1820],
			[22.2, 'click', 'a.category-link'],
		],
	],
	[
		'/category/:slug',
		'/category/running',
		RumtypesLoadingTypeDTO.route_change,
		22.4,
		15.8,
		[
			[22.45, 'request', 'GET /api/categories/:slug', 'catalog', 200, 520],
			[38.0, 'click', 'button.search-submit'],
		],
	],
	[
		'/search',
		'/search',
		RumtypesLoadingTypeDTO.route_change,
		38.2,
		53.9,
		[
			[38.25, 'request', 'GET /api/search', 'search', 200, 380],
			[92.0, 'click', 'a.product-card'],
		],
	],
	[
		'/product/:id',
		'/product/88213',
		RumtypesLoadingTypeDTO.route_change,
		92.1,
		106.3,
		[
			[92.15, 'request', 'GET /api/products/:id', 'catalog', 200, 1240],
			[
				93.42,
				'request',
				'GET /api/products/:id/recommendations',
				'recommendation',
				200,
				860,
			],
			[186.4, 'click', 'button#add-to-cart'],
			[186.5, 'request', 'POST /api/cart', 'cart-api', 200, 210],
			[186.7, 'action', 'add_to_cart'],
			[198.2, 'click', 'a.cart-link'],
		],
	],
	[
		'/cart',
		'/cart',
		RumtypesLoadingTypeDTO.route_change,
		198.4,
		80.2,
		[
			[198.45, 'request', 'GET /api/cart', 'cart-api', 200, 88],
			[238.9, 'click', 'button.qty-increase'],
			[238.92, 'request', 'POST /api/cart', 'cart-api', 502, 312],
			[239.6, 'error', 'HttpError', 'POST /api/cart returned 502'],
			[278.4, 'click', 'a.checkout-cta'],
		],
	],
	[
		'/checkout',
		'/checkout',
		RumtypesLoadingTypeDTO.route_change,
		278.6,
		93.6,
		[
			[278.7, 'request', 'GET /api/shipping/quote', '', 200, 420],
			[352.1, 'click', 'button#place-order'],
			[352.15, 'request', 'POST /api/checkout', 'checkout', 200, 640],
			[352.9, 'action', 'order_placed'],
		],
	],
];

const VITAL_NAMES: Record<string, RumtypesVitalNameDTO> = {
	lcp: RumtypesVitalNameDTO.lcp,
	fcp: RumtypesVitalNameDTO.fcp,
	ttfb: RumtypesVitalNameDTO.ttfb,
};

function timelineEvent(
	start: number,
	route: string,
	[atS, kind, title, detail = '', status = 0, durationMs = 0]: EventRow,
	index: number,
): RumtypesTimelineEventDTO {
	const event: RumtypesTimelineEventDTO = {
		kind: RumtypesTimelineEventKindDTO[kind],
		timestamp: new Date(start + atS * 1000).toISOString(),
		route,
	};
	if (kind === 'request') {
		const [method, path] = title.split(' ');
		event.request = {
			method,
			host: 'api.shop.example.com',
			path,
			spanId: `b7ad6b71692033${String(index).padStart(2, '0')}`,
			traceId: `4bf92f3577b34da6a3ce929d0e0e47${String(index).padStart(2, '0')}`,
			url: `https://api.shop.example.com${path.replace(':id', '88213').replace(':slug', 'running')}`,
			statusCode: status,
			durationMs,
			failed: status >= 400,
			hasBackend: detail !== '',
			backendService: detail,
		};
	}
	if (kind === 'click' || kind === 'action') {
		event.action =
			kind === 'click'
				? { type: 'click', name: '', target: title }
				: { type: 'custom', name: title, target: '' };
	}
	if (kind === 'error') {
		event.error = {
			fingerprint: 'ec82dea88ad412e0',
			type: title,
			message: detail,
			source: 'unhandledrejection',
		};
	}
	if (kind === 'vital') {
		event.vital = {
			name: VITAL_NAMES[title],
			value: durationMs,
			rating: RumtypesVitalRatingDTO.good,
		};
	}
	return event;
}

/** 7f3ac9…c21e: six views, a failed cart update and its error; `truncated` marks a large session. */
export function rumSession(truncated = false): RumtypesGettableSessionDTO {
	const summary = RUM_SESSION_LIST[0];
	const start = Date.parse(summary.startedAt);
	let index = 0;
	const timeline: RumtypesSessionViewDTO[] = VIEWS.map(
		([route, path, loadingType, startS, durationS, events], viewIndex) => ({
			timestamp: new Date(start + startS * 1000).toISOString(),
			route,
			path,
			spanId: `00f067aa0ba902b${viewIndex}`,
			loadingType,
			durationMs: durationS * 1000,
			events: events.map((row) => {
				index += 1;
				return timelineEvent(start, route, row, index);
			}),
		}),
	);
	return {
		...summary,
		views: timeline.length,
		pageLoads: 1,
		requests: 9,
		failedRequests: 1,
		vitals: 3,
		truncated,
		leadingEvents: [],
		timeline,
	};
}
