import { useCallback, useMemo, useReducer } from 'react';
import { useQuery } from 'react-query';
import { inspectMetrics } from 'api/generated/services/metrics';
import { isAxiosError } from 'axios';
import { MAX_QUERY_RETRIES } from 'constants/reactQuery';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { themeColors } from 'constants/theme';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { assignSeriesColors } from 'lib/uPlotLib/utils/assignSeriesColors';

import { INITIAL_INSPECT_METRICS_OPTIONS } from './constants';
import {
	GraphPopoverData,
	InspectionStep,
	InspectMetricsSeries,
	MetricInspectionAction,
	MetricInspectionState,
	UseInspectMetricsReturnData,
} from './types';
import {
	applySpaceAggregation,
	applyTimeAggregation,
	getAllTimestampsOfMetrics,
} from './utils';

const metricInspectionReducer = (
	state: MetricInspectionState,
	action: MetricInspectionAction,
): MetricInspectionState => {
	switch (action.type) {
		case 'SET_TIME_AGGREGATION_OPTION':
			return {
				...state,
				currentOptions: {
					...state.currentOptions,
					timeAggregationOption: action.payload,
				},
			};
		case 'SET_TIME_AGGREGATION_INTERVAL':
			return {
				...state,
				currentOptions: {
					...state.currentOptions,
					timeAggregationInterval: action.payload,
				},
			};
		case 'SET_SPACE_AGGREGATION_OPTION':
			return {
				...state,
				currentOptions: {
					...state.currentOptions,
					spaceAggregationOption: action.payload,
				},
			};
		case 'SET_SPACE_AGGREGATION_LABELS':
			return {
				...state,
				currentOptions: {
					...state.currentOptions,
					spaceAggregationLabels: action.payload,
				},
			};
		case 'SET_FILTERS':
			return {
				...state,
				currentOptions: {
					...state.currentOptions,
					filterExpression: action.payload,
				},
			};
		case 'APPLY_METRIC_INSPECTION_OPTIONS':
			return {
				...state,
				appliedOptions: {
					...state.appliedOptions,
					...state.currentOptions,
				},
			};
		case 'RESET_INSPECTION':
			return {
				...INITIAL_INSPECT_METRICS_OPTIONS,
			};
		default:
			return state;
	}
};

export function useInspectMetrics(
	metricName: string | null,
): UseInspectMetricsReturnData {
	// Inspect Metrics API Call and data formatting
	const { start, end } = useMemo(() => {
		const now = Date.now();
		return {
			start: now - 30 * 60 * 1000, // 30 minutes ago
			end: now, // now
		};
	}, []);

	// Inspect metrics data selection
	const [metricInspectionOptions, dispatchMetricInspectionOptions] = useReducer(
		metricInspectionReducer,
		INITIAL_INSPECT_METRICS_OPTIONS,
	);

	const {
		data: inspectMetricsResponse,
		isLoading: isInspectMetricsLoading,
		isError: isInspectMetricsError,
		isRefetching: isInspectMetricsRefetching,
	} = useQuery({
		queryKey: [
			REACT_QUERY_KEY.GET_INSPECT_METRICS_DETAILS,
			metricName,
			start,
			end,
			metricInspectionOptions.appliedOptions.filterExpression,
		],
		queryFn: ({ signal }) =>
			inspectMetrics(
				{
					metricName: metricName ?? '',
					start,
					end,
					filter: metricInspectionOptions.appliedOptions.filterExpression
						? { expression: metricInspectionOptions.appliedOptions.filterExpression }
						: undefined,
				},
				signal,
			),
		enabled: !!metricName,
		keepPreviousData: true,
		retry: (failureCount: number, error: Error): boolean => {
			if (isAxiosError(error) && error.code === 'ERR_CANCELED') {
				return false;
			}
			return failureCount < MAX_QUERY_RETRIES;
		},
	});

	const inspectMetricsData = useMemo(
		() => ({
			series: (inspectMetricsResponse?.data?.series ?? []).map((s) => {
				const labels: Record<string, string> = {};
				for (const l of s.labels ?? []) {
					if (l.key?.name) {
						labels[l.key.name] = String(l.value ?? '');
					}
				}
				return {
					labels,
					values: (s.values ?? []).map((v) => ({
						timestamp: v.timestamp ?? 0,
						value: String(v.value ?? 0),
					})),
				};
			}) as InspectMetricsSeries[],
		}),
		[inspectMetricsResponse],
	);
	const isDarkMode = useIsDarkMode();

	const inspectMetricsTimeSeries = useMemo(() => {
		const series = inspectMetricsData?.series ?? [];
		const titles = series.map((_, index) => `TS${index + 1}`);
		const colors = assignSeriesColors(
			titles,
			isDarkMode ? themeColors.chartcolors : themeColors.lightModeColor,
		);

		return series.map((series, index) => ({
			...series,
			values: [...series.values].sort((a, b) => a.timestamp - b.timestamp),
			title: titles[index],
			strokeColor: colors[titles[index]],
		}));
	}, [inspectMetricsData, isDarkMode]);

	// Evaluate inspection step
	const currentInspectionStep = useMemo(() => {
		if (metricInspectionOptions.currentOptions.spaceAggregationOption) {
			return InspectionStep.COMPLETED;
		}
		if (
			metricInspectionOptions.currentOptions.timeAggregationOption &&
			metricInspectionOptions.currentOptions.timeAggregationInterval
		) {
			return InspectionStep.SPACE_AGGREGATION;
		}
		return InspectionStep.TIME_AGGREGATION;
	}, [metricInspectionOptions]);

	const appliedInspectionStep = useMemo(() => {
		if (metricInspectionOptions.appliedOptions.spaceAggregationOption) {
			return InspectionStep.COMPLETED;
		}
		if (
			metricInspectionOptions.appliedOptions.timeAggregationOption &&
			metricInspectionOptions.appliedOptions.timeAggregationInterval
		) {
			return InspectionStep.SPACE_AGGREGATION;
		}
		return InspectionStep.TIME_AGGREGATION;
	}, [metricInspectionOptions]);

	const {
		aggregatedTimeSeries,
		spaceAggregatedSeriesMap,
		timeAggregatedSeriesMap,
	} = useMemo(() => {
		let timeSeries: InspectMetricsSeries[] = inspectMetricsTimeSeries;
		let timeAggregatedMap = new Map<number, GraphPopoverData[]>();
		let spaceAggregatedMap = new Map<string, InspectMetricsSeries[]>();

		// Apply time aggregation once required options are set
		if (
			appliedInspectionStep >= InspectionStep.SPACE_AGGREGATION &&
			metricInspectionOptions.appliedOptions.timeAggregationOption &&
			metricInspectionOptions.appliedOptions.timeAggregationInterval
		) {
			const { timeAggregatedSeries, timeAggregatedSeriesMap } =
				applyTimeAggregation(timeSeries, metricInspectionOptions.appliedOptions);
			timeSeries = timeAggregatedSeries;
			timeAggregatedMap = timeAggregatedSeriesMap;
		}
		// Apply space aggregation
		if (appliedInspectionStep === InspectionStep.COMPLETED) {
			const { aggregatedSeries, spaceAggregatedSeriesMap } = applySpaceAggregation(
				timeSeries,
				metricInspectionOptions.appliedOptions,
			);
			timeSeries = aggregatedSeries;
			spaceAggregatedMap = spaceAggregatedSeriesMap;
		}

		return {
			aggregatedTimeSeries: timeSeries,
			spaceAggregatedSeriesMap: spaceAggregatedMap,
			timeAggregatedSeriesMap: timeAggregatedMap,
		};
	}, [inspectMetricsTimeSeries, appliedInspectionStep, metricInspectionOptions]);

	const formattedInspectMetricsTimeSeries = useMemo(() => {
		const timestamps = getAllTimestampsOfMetrics(aggregatedTimeSeries);

		const timeseriesArray = aggregatedTimeSeries.map((series) => {
			const valuesMap = new Map<number, number>();

			series.values.forEach(({ timestamp, value }) => {
				valuesMap.set(timestamp, Number.parseFloat(value));
			});

			return timestamps.map((timestamp) => valuesMap.get(timestamp) ?? Number.NaN);
		});

		const rawData = [timestamps, ...timeseriesArray];
		return rawData.map((series) => new Float64Array(series));
	}, [aggregatedTimeSeries]);

	const spaceAggregationLabels = useMemo(() => {
		const labels = new Set<string>();
		inspectMetricsData?.series?.forEach((series) => {
			Object.keys(series.labels).forEach((label) => {
				labels.add(label);
			});
		});
		return [...labels];
	}, [inspectMetricsData]);

	const reset = useCallback(() => {
		dispatchMetricInspectionOptions({
			type: 'RESET_INSPECTION',
		});
	}, [dispatchMetricInspectionOptions]);

	return {
		inspectMetricsTimeSeries,
		isInspectMetricsLoading,
		isInspectMetricsError,
		formattedInspectMetricsTimeSeries,
		spaceAggregationLabels,
		metricInspectionOptions,
		dispatchMetricInspectionOptions,
		inspectionStep: currentInspectionStep,
		appliedInspectionStep,
		isInspectMetricsRefetching,
		spaceAggregatedSeriesMap,
		aggregatedTimeSeries,
		timeAggregatedSeriesMap,
		reset,
	};
}
