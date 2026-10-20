import {
	EndpointRow,
	endpointRows,
	EndpointSparks,
	EndpointStats,
	EndpointTotals,
	TopOperationLike,
} from './endpoints';
import { RangeResponse, scalarRows, Series, seriesOf } from './queryRange';
import { EndpointGroupBy } from './serviceRequests';
import { NS_PER_MS } from './spanMetrics';
import { ApmSource } from './types';
import { ApmWindow } from './window';

interface EndpointResponses {
	series: RangeResponse | undefined;
	totals: RangeResponse | undefined;
	/** Traces by span name: `/api/v2/service/top_operations`, latency in ns. */
	topOperations: TopOperationLike[] | undefined;
}

const finite = (value: number | undefined): number =>
	value !== undefined && Number.isFinite(value) ? value : 0;

const byKey = (series: Series[], key: string): Record<string, Series> =>
	Object.fromEntries(series.map((item) => [item.labels[key] ?? '', item]));

const values = (series: Series | undefined, scale = 1): number[] =>
	series?.points.map((point) => finite(point.value) / scale) ?? [];

const sum = (series: Series | undefined, scale = 1): number =>
	values(series, scale).reduce((total, value) => total + value, 0);

function traceSeries(
	response: RangeResponse | undefined,
	key: string,
	window: ApmWindow,
): {
	sparks: Record<string, EndpointSparks>;
	totals: Record<string, EndpointTotals>;
} {
	const counts = byKey(seriesOf(response, 'A', 0), key);
	const durations = byKey(seriesOf(response, 'A', 1), key);
	const p99 = byKey(seriesOf(response, 'A', 2), key);
	const keys = Object.keys(counts);
	return {
		sparks: Object.fromEntries(
			keys.map((name) => [
				name,
				{
					rate: values(counts[name], window.step),
					p99: values(p99[name], NS_PER_MS),
				},
			]),
		),
		totals: Object.fromEntries(
			keys.map((name) => [
				name,
				{
					requests: sum(counts[name]),
					durationMs: sum(durations[name], NS_PER_MS),
				},
			]),
		),
	};
}

function traceScalar(
	response: RangeResponse | undefined,
	key: string,
): { operations: EndpointStats[]; totals: Record<string, EndpointTotals> } {
	const rows = scalarRows(response, 'A');
	return {
		operations: rows.map((row) => {
			const [count, errors, p50, p95, p99] = row.values.map(finite);
			return {
				name: row.labels[key] ?? '',
				numCalls: count,
				errorCount: errors,
				p50: p50 / NS_PER_MS,
				p95: p95 / NS_PER_MS,
				p99: p99 / NS_PER_MS,
			};
		}),
		totals: Object.fromEntries(
			rows.map((row) => [
				row.labels[key] ?? '',
				{
					requests: finite(row.values[0]),
					durationMs: finite(row.values[5]) / NS_PER_MS,
				},
			]),
		),
	};
}

function metricData(
	window: ApmWindow,
	{ series, totals }: EndpointResponses,
): EndpointRow[] {
	const column = (name: string): Record<string, number> =>
		Object.fromEntries(
			scalarRows(totals, name).map((row) => [
				row.labels.operation ?? '',
				finite(row.values[0]),
			]),
		);
	const [calls, errors, p50, p95, p99, duration] = [
		'A',
		'B',
		'C',
		'D',
		'E',
		'F',
	].map(column);
	const rates = byKey(seriesOf(series, 'A'), 'operation');
	const p99Series = byKey(seriesOf(series, 'B'), 'operation');
	const names = Object.keys(calls);
	return endpointRows({
		window,
		operations: names.map((name) => ({
			name,
			numCalls: calls[name],
			errorCount: errors[name] ?? 0,
			p50: p50[name] ?? 0,
			p95: p95[name] ?? 0,
			p99: p99[name] ?? 0,
		})),
		totals: Object.fromEntries(
			names.map((name) => [
				name,
				{ requests: calls[name], durationMs: duration[name] ?? 0 },
			]),
		),
		sparks: Object.fromEntries(
			names.map((name) => [
				name,
				{ rate: values(rates[name]), p99: values(p99Series[name]) },
			]),
		),
	});
}

/** Rows of the Endpoints table from whichever responses the source needs. */
export function endpointData(
	source: ApmSource,
	groupBy: EndpointGroupBy,
	window: ApmWindow,
	responses: EndpointResponses,
): EndpointRow[] {
	if (source === 'span-metrics') {
		return metricData(window, responses);
	}
	const { sparks, totals: seriesTotals } = traceSeries(
		responses.series,
		groupBy,
		window,
	);
	if (groupBy !== 'name') {
		const { operations, totals } = traceScalar(responses.totals, groupBy);
		return endpointRows({ window, operations, totals, sparks });
	}
	return endpointRows({
		window,
		operations: (responses.topOperations ?? []).map((operation) => ({
			...operation,
			p50: operation.p50 / NS_PER_MS,
			p95: operation.p95 / NS_PER_MS,
			p99: operation.p99 / NS_PER_MS,
		})),
		totals: seriesTotals,
		sparks,
	});
}
