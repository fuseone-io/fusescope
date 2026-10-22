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
import {
	applicationFilter,
	exceptionEventsFilter,
	RUM_ATTRIBUTES,
	viewSpansFilter,
	webVitalEventsFilter,
} from './attributes';
import {
	ApplicationOverview,
	ErrorGroup,
	RouteVitals,
	SessionSummary,
} from './overviewTypes';
import { logQuery, numberCell, orderedBy, timestampMs } from './queryRange';

const SESSIONS = `count_distinct(${RUM_ATTRIBUTES.sessionId})`;
const ROUTE = RUM_ATTRIBUTES.route;
export const TOP_ROUTES = 7;
export const RECENT_ERRORS = 5;
export const RECENT_SESSIONS = 6;

export function overviewFilter(applicationId: string, release: string): string {
	return allOf(
		applicationFilter(applicationId),
		release ? `${RUM_ATTRIBUTES.serviceVersion} = ${quote(release)}` : '',
	);
}

export function overviewRequest(
	window: ApmWindow,
	applicationId: string,
	release: string,
): QueryRangeRequestV5 {
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
		logQuery({
			name: 'ER',
			filter: errors,
			groupBy: [
				RUM_ATTRIBUTES.exceptionType,
				RUM_ATTRIBUTES.exceptionMessage,
				ROUTE,
			],
			aggregations: ['count()', SESSIONS, 'max(timestamp)'],
			limit: 50,
		}),
		orderedBy(
			traceQuery({
				name: 'SS',
				filter: app,
				groupBy: [
					RUM_ATTRIBUTES.sessionId,
					RUM_ATTRIBUTES.userAgent,
					RUM_ATTRIBUTES.serviceVersion,
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

function errorGroups(response: RangeResponse | undefined): ErrorGroup[] {
	return rawScalarRows(response, 'ER')
		.map((row) => ({
			type: row.labels[RUM_ATTRIBUTES.exceptionType] || 'Error',
			message: row.labels[RUM_ATTRIBUTES.exceptionMessage] ?? '',
			route: row.labels[ROUTE] ?? '',
			events: count(row),
			sessions: count(row, 1),
			lastSeen: timestampMs(row.values[2]),
		}))
		.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
		.slice(0, RECENT_ERRORS);
}

function sessionSummaries(
	response: RangeResponse | undefined,
): SessionSummary[] {
	return rawScalarRows(response, 'SS')
		.map((row) => {
			const start = timestampMs(row.values[0]);
			const end = timestampMs(row.values[1]);
			return {
				id: row.labels[RUM_ATTRIBUTES.sessionId] ?? '',
				start,
				durationMs:
					start !== undefined && end !== undefined ? end - start : undefined,
				views: count(row, 2),
				userAgent: row.labels[RUM_ATTRIBUTES.userAgent] ?? '',
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
	const routes = routeVitals(response);
	return {
		current: sessionTotals(count(row('S')), count(row('E'))),
		previous: previous
			? sessionTotals(count(previous), count(row('EP')))
			: undefined,
		views: count(row('S'), 1),
		vitals: vitalSummaries(rawScalarRows(response, 'V')),
		routes: topRoutes(routes),
		routeCount: routes.length,
		errors: errorGroups(response),
		sessions: sessionSummaries(response),
		sdk: latestSdk(response, applicationId),
		releases: rawScalarRows(response, 'RL')
			.map((release) => release.labels[RUM_ATTRIBUTES.serviceVersion])
			.filter(Boolean)
			.sort()
			.reverse(),
	};
}
