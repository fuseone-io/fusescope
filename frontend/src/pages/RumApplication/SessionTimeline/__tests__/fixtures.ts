import {
	RumtypesGettableSessionDTO,
	RumtypesLoadingTypeDTO,
	RumtypesTimelineEventDTO,
	RumtypesTimelineEventKindDTO,
	RumtypesVitalNameDTO,
	RumtypesVitalRatingDTO,
} from 'api/generated/services/fuseScope.schemas';

const T0 = Date.parse('2026-10-22T14:00:00Z');
export const at = (ms: number): string => new Date(T0 + ms).toISOString();

export const click = (ms: number): RumtypesTimelineEventDTO => ({
	kind: RumtypesTimelineEventKindDTO.click,
	timestamp: at(ms),
	route: '/',
	action: { type: 'click', name: '', target: 'a.link' },
});

export const request = (
	ms: number,
	durationMs: number,
	overrides: Partial<NonNullable<RumtypesTimelineEventDTO['request']>> = {},
): RumtypesTimelineEventDTO => ({
	kind: RumtypesTimelineEventKindDTO.request,
	timestamp: at(ms),
	route: '/',
	request: {
		method: 'GET',
		host: 'api.example.com',
		path: '/api/items',
		spanId: `span-${ms}`,
		traceId: `trace-${ms}`,
		url: 'https://api.example.com/api/items',
		statusCode: 200,
		durationMs,
		failed: false,
		hasBackend: true,
		backendService: 'catalog',
		...overrides,
	},
});

export const error = (ms: number): RumtypesTimelineEventDTO => ({
	kind: RumtypesTimelineEventKindDTO.error,
	timestamp: at(ms),
	route: '/cart',
	error: {
		fingerprint: 'fp',
		type: 'HttpError',
		message: 'POST /api/cart returned 502',
		source: 'unhandledrejection',
	},
});

export const vital = (ms: number): RumtypesTimelineEventDTO => ({
	kind: RumtypesTimelineEventKindDTO.vital,
	timestamp: at(ms),
	route: '/',
	vital: {
		name: RumtypesVitalNameDTO.lcp,
		value: 1820,
		rating: RumtypesVitalRatingDTO.good,
	},
});

export function session(
	overrides: Partial<RumtypesGettableSessionDTO> = {},
): RumtypesGettableSessionDTO {
	return {
		sessionId: '7f3ac9d04b1e4a6f9e2b5c8d1a07c21e',
		previousSessionId: '',
		userId: '',
		startedAt: at(0),
		endedAt: at(10_000),
		durationMs: 10_000,
		views: 2,
		actions: 2,
		errors: 1,
		client: {
			browser: 'Chrome',
			browserVersion: '130',
			device: '',
			os: 'Linux',
			osVersion: '',
		},
		release: '1.8.0',
		environment: 'production',
		pageLoads: 1,
		requests: 2,
		failedRequests: 1,
		vitals: 1,
		truncated: false,
		leadingEvents: [],
		timeline: [
			{
				timestamp: at(0),
				route: '/',
				path: '/',
				spanId: 'v1',
				loadingType: RumtypesLoadingTypeDTO.initial_load,
				durationMs: 4000,
				events: [vital(500), request(1000, 1000), click(3900)],
			},
			{
				timestamp: at(4000),
				route: '/cart',
				path: '/cart',
				spanId: 'v2',
				loadingType: RumtypesLoadingTypeDTO.route_change,
				durationMs: 6000,
				events: [
					click(4000),
					request(5000, 500, {
						failed: true,
						statusCode: 502,
						hasBackend: false,
						backendService: '',
					}),
					error(5600),
				],
			},
		],
		...overrides,
	};
}
