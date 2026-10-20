import { EndpointRow } from 'lib/apm/endpoints';
import { EndpointGroupBy } from 'lib/apm/serviceRequests';

export const GROUP_LABEL: Record<EndpointGroupBy, string> = {
	name: 'Operation',
	'http.route': 'http.route',
	'rpc.method': 'rpc.method',
};

export const GROUP_SUBTITLE: Record<EndpointGroupBy, string> = {
	name: 'Span names of the service, with their share of its time.',
	'http.route':
		'Spans grouped by route template; spans without a route are “(not set)”.',
	'rpc.method': 'gRPC spans grouped by method; other spans are “(not set)”.',
};

const fixed = (value: number | undefined): string =>
	value === undefined ? '' : value.toFixed(2);

/** The table as rows for the Download menu. */
export function endpointsToDownloadData(
	rows: EndpointRow[],
	groupBy: EndpointGroupBy,
): Record<string, string>[] {
	return rows.map((row) => ({
		[GROUP_LABEL[groupBy]]: row.name,
		'Rate (req/s)': row.rate.toFixed(3),
		'Avg (ms)': fixed(row.avg),
		'P50 (in ms)': fixed(row.p50),
		'P95 (in ms)': fixed(row.p95),
		'P99 (in ms)': fixed(row.p99),
		'Number of calls': String(row.requests),
		'Error Rate (%)': row.errorRate.toFixed(2),
		'Time spent (%)': row.share.toFixed(1),
	}));
}
