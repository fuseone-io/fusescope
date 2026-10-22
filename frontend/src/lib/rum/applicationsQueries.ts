import { allOf } from 'lib/apm/filters';
import {
	rangeRequest,
	RangeResponse,
	rawScalarRows,
	seriesOf,
	traceQuery,
} from 'lib/apm/queryRange';
import { ApmWindow } from 'lib/apm/window';
import { QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import {
	applicationsFilter,
	exceptionEventsFilter,
	RUM_ATTRIBUTES,
	viewSpansFilter,
	vitalRatingCountIf,
	webVitalEventsFilter,
} from './attributes';
import { sessionErrorRate } from './errorRate';
import {
	ApplicationMetrics,
	SessionTotals,
	VitalSummaries,
} from './metricTypes';
import { logQuery, numberCell, timestampMs } from './queryRange';
import { VitalName } from './types';

const BY_APP = [RUM_ATTRIBUTES.applicationId];
const SESSIONS = `count_distinct(${RUM_ATTRIBUTES.sessionId})`;
export const VITAL_AGGREGATIONS = [
	`p75(${RUM_ATTRIBUTES.vitalValue})`,
	vitalRatingCountIf('good'),
	vitalRatingCountIf('needs-improvement'),
	vitalRatingCountIf('poor'),
];
const VITALS: VitalName[] = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];

/** Per application: sessions, error sessions and vitals now and a period back, plus activity. */
export function applicationsRequests(
	window: ApmWindow,
	applicationIds: string[],
): { totals: QueryRangeRequestV5; series: QueryRangeRequestV5 } {
	const apps = applicationsFilter(applicationIds);
	const errors = allOf(apps, exceptionEventsFilter);
	return {
		totals: rangeRequest(window, 'scalar', [
			traceQuery({
				name: 'S',
				filter: apps,
				groupBy: BY_APP,
				aggregations: [SESSIONS, `countIf(${viewSpansFilter})`, 'max(timestamp)'],
			}),
			traceQuery({
				name: 'SP',
				filter: apps,
				groupBy: BY_APP,
				aggregations: [SESSIONS],
				shift: window.seconds,
			}),
			logQuery({
				name: 'E',
				filter: errors,
				groupBy: BY_APP,
				aggregations: [SESSIONS],
			}),
			logQuery({
				name: 'EP',
				filter: errors,
				groupBy: BY_APP,
				aggregations: [SESSIONS],
				shift: window.seconds,
			}),
			logQuery({
				name: 'V',
				filter: allOf(apps, webVitalEventsFilter),
				groupBy: [...BY_APP, RUM_ATTRIBUTES.vitalName],
				aggregations: VITAL_AGGREGATIONS,
			}),
			traceQuery({
				name: 'K',
				filter: apps,
				groupBy: [
					...BY_APP,
					RUM_ATTRIBUTES.distroName,
					RUM_ATTRIBUTES.distroVersion,
				],
				aggregations: ['max(timestamp)'],
			}),
		]),
		series: rangeRequest(window, 'time_series', [
			traceQuery({
				name: 'A',
				filter: apps,
				groupBy: BY_APP,
				aggregations: ['count()'],
				step: window.step,
			}),
		]),
	};
}

const isVital = (name: string): name is VitalName =>
	VITALS.includes(name as VitalName);

/** Vital summaries of rows grouped by `browser.web_vital.name` (plus `keys`). */
export function vitalSummaries(
	rows: { labels: Record<string, string>; values: unknown[] }[],
): VitalSummaries {
	const summaries: VitalSummaries = {};
	rows.forEach(({ labels, values }) => {
		const name = labels[RUM_ATTRIBUTES.vitalName]?.toLowerCase() ?? '';
		if (!isVital(name)) {
			return;
		}
		const [p75, good, needsImprovement, poor] = values.map(numberCell);
		const counts = {
			good: good || 0,
			needsImprovement: needsImprovement || 0,
			poor: poor || 0,
		};
		summaries[name] = {
			p75,
			counts,
			samples: counts.good + counts.needsImprovement + counts.poor,
		};
	});
	return summaries;
}

export function sessionTotals(
	sessions: number,
	sessionsWithErrors: number,
): SessionTotals {
	return {
		sessions,
		sessionsWithErrors,
		errorRate: sessionErrorRate(sessionsWithErrors, sessions),
	};
}

function byApp(
	response: RangeResponse | undefined,
	queryName: string,
): Map<string, unknown[][]> {
	const grouped = new Map<string, unknown[][]>();
	rawScalarRows(response, queryName).forEach(({ labels, values }) => {
		const id = labels[RUM_ATTRIBUTES.applicationId];
		grouped.set(id, [...(grouped.get(id) ?? []), values]);
	});
	return grouped;
}

const first = (map: Map<string, unknown[][]>, id: string, index = 0): number =>
	numberCell(map.get(id)?.[0]?.[index]) || 0;

/** The SDK of the application's most recent span, from query `K`. */
export function latestSdk(
	response: RangeResponse | undefined,
	applicationId: string,
): ApplicationMetrics['sdk'] {
	const latest = rawScalarRows(response, 'K')
		.filter(
			({ labels }) =>
				labels[RUM_ATTRIBUTES.applicationId] === applicationId &&
				labels[RUM_ATTRIBUTES.distroName],
		)
		.map(({ labels, values }) => ({
			name: labels[RUM_ATTRIBUTES.distroName],
			version: labels[RUM_ATTRIBUTES.distroVersion] ?? '',
			at: timestampMs(values[0]) ?? 0,
		}))
		.sort((a, b) => b.at - a.at)[0];
	return latest && { name: latest.name, version: latest.version };
}

/** Metrics per application id; applications without data are absent. */
export function applicationsMetrics(
	applicationIds: string[],
	totals: RangeResponse | undefined,
	series: RangeResponse | undefined,
): Record<string, ApplicationMetrics> {
	const sessions = byApp(totals, 'S');
	const previous = byApp(totals, 'SP');
	const errors = byApp(totals, 'E');
	const previousErrors = byApp(totals, 'EP');
	const vitalRows = rawScalarRows(totals, 'V');
	const activity = seriesOf(series, 'A');

	return Object.fromEntries(
		applicationIds.map((id): [string, ApplicationMetrics] => [
			id,
			{
				current: sessionTotals(first(sessions, id), first(errors, id)),
				previous: previous.has(id)
					? sessionTotals(first(previous, id), first(previousErrors, id))
					: undefined,
				views: first(sessions, id, 1),
				lastSeen: timestampMs(sessions.get(id)?.[0]?.[2]),
				vitals: vitalSummaries(
					vitalRows.filter(
						({ labels }) => labels[RUM_ATTRIBUTES.applicationId] === id,
					),
				),
				sdk: latestSdk(totals, id),
				activity:
					activity
						.find(({ labels }) => labels[RUM_ATTRIBUTES.applicationId] === id)
						?.points.map(({ value }) => value) ?? [],
			},
		]),
	);
}
