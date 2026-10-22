import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import { sessionErrorRate } from 'lib/rum/errorRate';

import { ApplicationFilters, ApplicationRow, ApplicationsKpis } from './types';

const sum = (values: number[]): number =>
	values.reduce((total, value) => total + value, 0);

export function applicationsKpis(rows: ApplicationRow[]): ApplicationsKpis {
	const measured = rows.flatMap((row) => (row.metrics ? [row.metrics] : []));
	const withHistory = measured.flatMap((metrics) =>
		metrics.previous ? [metrics.previous] : [],
	);
	const sessions = sum(measured.map((metrics) => metrics.current.sessions));
	const previousSessions = sum(withHistory.map((totals) => totals.sessions));
	const lcp = measured.flatMap((metrics) =>
		metrics.vitals.lcp ? [metrics.vitals.lcp] : [],
	);
	const lcpSamples = sum(lcp.map((summary) => summary.samples));
	const web = rows.filter(
		(row) => row.application.platform === RumtypesPlatformDTO.web,
	).length;

	return {
		applications: rows.length,
		web,
		mobile: rows.length - web,
		sessions,
		previousSessions: withHistory.length > 0 ? previousSessions : undefined,
		errorRate: sessionErrorRate(
			sum(measured.map((metrics) => metrics.current.sessionsWithErrors)),
			sessions,
		),
		previousErrorRate: sessionErrorRate(
			sum(withHistory.map((totals) => totals.sessionsWithErrors)),
			previousSessions,
		),
		goodLcp:
			lcpSamples > 0
				? (sum(lcp.map((summary) => summary.counts.good)) / lcpSamples) * 100
				: undefined,
		outdated: rows.filter((row) => row.support === 'outdated'),
	};
}

export function filterApplications(
	rows: ApplicationRow[],
	{ search, platform, environment }: ApplicationFilters,
): ApplicationRow[] {
	const term = search.trim().toLowerCase();
	return rows.filter(
		({ application }) =>
			(!term || application.name.toLowerCase().includes(term)) &&
			(platform === 'all' || application.platform === platform) &&
			(!environment || application.environment === environment),
	);
}

export function environmentsOf(rows: ApplicationRow[]): string[] {
	return [...new Set(rows.map((row) => row.application.environment))].sort();
}
