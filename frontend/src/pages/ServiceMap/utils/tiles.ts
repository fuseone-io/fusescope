import { kpiDeltas } from 'container/MetricsApplication/Tabs/Overview/kpiFormat';
import {
	formatLatencyMs,
	formatPercent,
	formatRate,
	NOT_AVAILABLE,
} from 'lib/apm/format';
import { ServiceSparks } from 'lib/apm/servicesList';
import { PeriodStats } from 'lib/apm/types';

import { KpiTile, MapNode } from '../types';

const errorClass = (errorRate: number | undefined): string | undefined =>
	errorRate !== undefined && errorRate >= 1 ? 'tw:text-error' : undefined;

/** Throughput, error rate, p99 and Apdex, each against the previous period. */
export function serviceTiles(
	current: PeriodStats | undefined,
	previous: PeriodStats | undefined,
	sparks: ServiceSparks | undefined,
): KpiTile[] {
	const deltas = kpiDeltas(current, previous);
	return [
		{
			label: 'Throughput',
			value: formatRate(current?.rate),
			delta: deltas.rate,
			spark: sparks?.rate,
			sparkClassName: 'tw:stroke-primary',
		},
		{
			label: 'Error rate',
			value: formatPercent(current?.errorRate),
			valueClassName: errorClass(current?.errorRate),
			delta: deltas.errorRate,
			spark: sparks?.errorRate,
			sparkClassName:
				(current?.errorRate ?? 0) >= 1 ? 'tw:stroke-error' : 'tw:stroke-success',
		},
		{
			label: 'p99 latency',
			value: formatLatencyMs(current?.p99),
			delta: deltas.p99,
			spark: sparks?.p99,
			sparkClassName: 'tw:stroke-primary',
		},
		{
			label: 'Apdex',
			value:
				current?.apdex === undefined ? NOT_AVAILABLE : current.apdex.toFixed(2),
			delta: deltas.apdex,
		},
	];
}

/** A node without spans of its own: what its callers measured. */
export function dependencyTiles(node: MapNode, callers: number): KpiTile[] {
	return [
		{ label: 'Throughput', value: formatRate(node.rate) },
		{
			label: 'Error rate',
			value: formatPercent(node.errorRate),
			valueClassName: errorClass(node.errorRate),
		},
		{ label: 'p99 latency', value: formatLatencyMs(node.p99) },
		{ label: 'Callers', value: String(callers) },
	];
}
