import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import { allOf, quote } from 'lib/apm/filters';
import {
	rangeRequest,
	RangeResponse,
	rawScalarRows,
	RawScalarRow,
	traceQuery,
} from 'lib/apm/queryRange';
import { ApmWindow } from 'lib/apm/window';
import { QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import {
	latestSdk,
	sessionTotals,
	VITAL_AGGREGATIONS,
	vitalSummaries,
} from './applicationsQueries';
import { APP_START_AGGREGATIONS, appStartSummaries } from './appStart';
import {
	appStartEventsFilter,
	applicationFilter,
	exceptionEventsFilter,
	RUM_ATTRIBUTES,
	viewSpansFilter,
	webVitalEventsFilter,
} from './attributes';
import { mobileClientLabel } from './client';
import {
	ApplicationOverview,
	RouteVitals,
	SessionSummary,
} from './overviewTypes';
import { logQuery, numberCell, orderedBy, timestampMs } from './queryRange';
import { newestReleasesFirst } from './releases';
import { describeUserAgent } from './userAgent';

const SESSIONS = `count_distinct(${RUM_ATTRIBUTES.sessionId})`;
const ROUTE = RUM_ATTRIBUTES.route;
export const TOP_ROUTES = 7;
export const RECENT_SESSIONS = 6;
const MOBILE_CLIENT = [
	RUM_ATTRIBUTES.osName,
	RUM_ATTRIBUTES.osVersion,
	RUM_ATTRIBUTES.deviceManufacturer,
	RUM_ATTRIBUTES.deviceModel,
];

export function overviewFilter(applicationId: string, release: string): string {
	return allOf(
		applicationFilter(applicationId),
		release ? `${RUM_ATTRIBUTES.serviceVersion} = ${quote(release)}` : '',
	);
}

/** Android also gets app start by start type, and sessions by device and OS. */
export function overviewRequest(
	window: ApmWindow,
	applicationId: string,
	release: string,
	platform: RumtypesPlatformDTO = RumtypesPlatformDTO.web,
): QueryRangeRequestV5 {
	const android = platform === RumtypesPlatformDTO.android;
	const app = overviewFilter(applicationId, release);
	const errors = allOf(app, exceptionEventsFilter);
	const vitals = allOf(app, webVitalEventsFilter);
	return rangeRequest(window, 'scalar', [
		traceQuery({
			name: 'S',
			filter: app,
			aggregations: [SESSIONS, `countIf(${viewSpansFilter})`],
		}),
		traceQuery({
			name: 'SP',
			filter: app,
			aggregations: [SESSIONS],
			shift: window.seconds,
		}),
		logQuery({ name: 'L', filter: app, aggregations: [SESSIONS] }),
		logQuery({
			name: 'LP',
			filter: app,
			aggregations: [SESSIONS],
			shift: window.seconds,
		}),
		logQuery({ name: 'E', filter: errors, aggregations: [SESSIONS] }),
		logQuery({
			name: 'EP',
			filter: errors,
			aggregations: [SESSIONS],
			shift: window.seconds,
		}),
		logQuery({
			name: 'V',
			filter: vitals,
			groupBy: [RUM_ATTRIBUTES.vitalName],
			aggregations: VITAL_AGGREGATIONS,
		}),
		logQuery({
			name: 'R',
			filter: vitals,
			groupBy: [ROUTE, RUM_ATTRIBUTES.vitalName],
			aggregations: VITAL_AGGREGATIONS,
		}),
		logQuery({
			name: 'RE',
			filter: errors,
			groupBy: [ROUTE],
			aggregations: ['count()'],
		}),
		orderedBy(
			traceQuery({
				name: 'SS',
				filter: app,
				groupBy: [
					RUM_ATTRIBUTES.sessionId,
					RUM_ATTRIBUTES.userAgent,
					RUM_ATTRIBUTES.serviceVersion,
					...(android ? MOBILE_CLIENT : []),
				],
				aggregations: [
					'min(timestamp)',
					'max(timestamp)',
					`countIf(${viewSpansFilter})`,
				],
				limit: RECENT_SESSIONS,
			}),
			'min(timestamp)',
			'desc',
		),
		traceQuery({
			name: 'K',
			filter: app,
			groupBy: [
				RUM_ATTRIBUTES.applicationId,
				RUM_ATTRIBUTES.distroName,
				RUM_ATTRIBUTES.distroVersion,
			],
			aggregations: ['max(timestamp)'],
		}),
		...(android
			? [
					logQuery({
						name: 'AS',
						filter: allOf(app, appStartEventsFilter),
						groupBy: [RUM_ATTRIBUTES.startType],
						aggregations: APP_START_AGGREGATIONS,
					}),
				]
			: []),
		traceQuery({
			name: 'RL',
			filter: applicationFilter(applicationId),
			groupBy: [RUM_ATTRIBUTES.serviceVersion],
			aggregations: ['count()'],
		}),
	]);
}

const count = (row: RawScalarRow | undefined, index = 0): number =>
	numberCell(row?.values[index]) || 0;

function routeVitals(response: RangeResponse | undefined): RouteVitals[] {
	const byRoute = new Map<string, RawScalarRow[]>();
	rawScalarRows(response, 'R').forEach((row) => {
		const route = row.labels[ROUTE] || '/';
		byRoute.set(route, [...(byRoute.get(route) ?? []), row]);
	});
	const errors = new Map(
		rawScalarRows(response, 'RE').map((row) => [
			row.labels[ROUTE] || '/',
			count(row),
		]),
	);
	return [...byRoute.entries()].map(([route, rows]) => {
		const vitals = vitalSummaries(rows);
		return {
			route,
			loads: vitals.lcp?.samples ?? 0,
			lcp: vitals.lcp,
			inp: vitals.inp?.p75,
			cls: vitals.cls?.p75,
			errors: errors.get(route) ?? 0,
		};
	});
}

/** Slowest LCP first; routes without LCP last. */
export function topRoutes(routes: RouteVitals[]): RouteVitals[] {
	return [...routes]
		.sort(
			(a, b) =>
				(b.lcp?.p75 ?? Number.NEGATIVE_INFINITY) -
					(a.lcp?.p75 ?? Number.NEGATIVE_INFINITY) || b.loads - a.loads,
		)
		.slice(0, TOP_ROUTES);
}

function sessionSummaries(
	response: RangeResponse | undefined,
): SessionSummary[] {
	return rawScalarRows(response, 'SS')
		.map((row) => {
			const start = timestampMs(row.values[0]);
			const end = timestampMs(row.values[1]);
			const userAgent = row.labels[RUM_ATTRIBUTES.userAgent] ?? '';
			const label = (key: string): string => row.labels[key] ?? '';
			return {
				id: row.labels[RUM_ATTRIBUTES.sessionId] ?? '',
				start,
				durationMs:
					start !== undefined && end !== undefined ? end - start : undefined,
				views: count(row, 2),
				userAgent,
				client:
					!userAgent && label(RUM_ATTRIBUTES.osName)
						? mobileClientLabel({
								os: label(RUM_ATTRIBUTES.osName),
								osVersion: label(RUM_ATTRIBUTES.osVersion),
								manufacturer: label(RUM_ATTRIBUTES.deviceManufacturer),
								model: label(RUM_ATTRIBUTES.deviceModel),
							})
						: describeUserAgent(userAgent),
				release: row.labels[RUM_ATTRIBUTES.serviceVersion] ?? '',
			};
		})
		.filter((session) => session.id)
		.sort((a, b) => (b.start ?? 0) - (a.start ?? 0))
		.slice(0, RECENT_SESSIONS);
}

export function applicationOverview(
	response: RangeResponse | undefined,
	applicationId: string,
): ApplicationOverview {
	const row = (name: string): RawScalarRow | undefined =>
		rawScalarRows(response, name)[0];
	const previous = row('SP');
	const previousLogs = row('LP');
	const routes = routeVitals(response);
	return {
		current: sessionTotals(count(row('S')), count(row('L')), count(row('E'))),
		previous:
			previous || previousLogs
				? sessionTotals(count(previous), count(previousLogs), count(row('EP')))
				: undefined,
		views: count(row('S'), 1),
		vitals: vitalSummaries(rawScalarRows(response, 'V')),
		appStart: appStartSummaries(rawScalarRows(response, 'AS')),
		routes: topRoutes(routes),
		routeCount: routes.length,
		sessions: sessionSummaries(response),
		sdk: latestSdk(response, applicationId),
		releases: newestReleasesFirst(
			rawScalarRows(response, 'RL')
				.map((release) => release.labels[RUM_ATTRIBUTES.serviceVersion])
				.filter(Boolean),
		),
	};
}
