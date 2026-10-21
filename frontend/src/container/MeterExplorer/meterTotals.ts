import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';
import { QueryData } from 'types/api/widgets/getQuery';

export interface MeterSummary {
	/** Sum of every bar the chart draws. */
	total: number;
	/** The tallest bar, stacking every series at the same time. */
	peak: number;
	hasData: boolean;
}

const pointsOf = (series: QueryData): [number, number][] =>
	(series.values ?? [])
		.map(([time, value]): [number, number] => [Number(time), Number(value)])
		.filter(([, value]) => Number.isFinite(value));

/** Totals read from the same response the chart draws, so they always agree. */
export function summarize(
	response: MetricRangePayloadProps | undefined,
): MeterSummary {
	const byTime = new Map<number, number>();
	(response?.data?.result ?? []).forEach((series) => {
		pointsOf(series).forEach(([time, value]) => {
			byTime.set(time, (byTime.get(time) ?? 0) + value);
		});
	});
	const stacks = [...byTime.values()];
	return {
		total: stacks.reduce((sum, value) => sum + value, 0),
		peak: stacks.length ? Math.max(...stacks) : 0,
		hasData: stacks.length > 0,
	};
}

/** Each series' own total, in response order. */
export function seriesTotals(
	response: MetricRangePayloadProps | undefined,
): number[] {
	return (response?.data?.result ?? []).map((series) =>
		pointsOf(series).reduce((sum, [, value]) => sum + value, 0),
	);
}
