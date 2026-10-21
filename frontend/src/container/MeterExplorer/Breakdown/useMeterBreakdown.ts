import { useMemo } from 'react';
import { useQueries } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { PANEL_TYPES } from 'constants/queryBuilder';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { GetMetricQueryRange } from 'lib/dashboard/getQueryResults';
import { AppState } from 'store/reducers';
import { SuccessResponse } from 'types/api';
import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';
import { Widgets } from 'types/api/widgets/widget';
import { DataSource } from 'types/common/queryBuilder';
import { GlobalReducer } from 'types/reducer/globalTime';

import { MeterSummary, summarize } from '../meterTotals';

export interface MeterChartState {
	widget: Widgets;
	response: MetricRangePayloadProps | undefined;
	summary: MeterSummary;
	isLoading: boolean;
	isError: boolean;
	refetch: () => void;
}

/** One hourly-bar query per widget; totals come from the same responses. */
export function useMeterBreakdown(widgets: Widgets[]): MeterChartState[] {
	const { selectedTime, maxTime, minTime } = useSelector<
		AppState,
		GlobalReducer
	>((state) => state.globalTime);

	const queries = useQueries(
		widgets.map((widget) => ({
			queryKey: [
				REACT_QUERY_KEY.GET_QUERY_RANGE,
				'meter-breakdown',
				widget.query,
				ENTITY_VERSION_V5,
				selectedTime,
				maxTime,
				minTime,
			],
			queryFn: ({
				signal,
			}: {
				signal?: AbortSignal;
			}): Promise<SuccessResponse<MetricRangePayloadProps>> =>
				GetMetricQueryRange(
					{
						query: widget.query,
						graphType: PANEL_TYPES.BAR,
						selectedTime: 'GLOBAL_TIME',
						globalSelectedInterval: selectedTime,
						params: { dataSource: DataSource.METRICS },
					},
					ENTITY_VERSION_V5,
					undefined,
					signal,
				),
		})),
	);

	return useMemo(
		() =>
			widgets.map((widget, index) => {
				const query = queries[index];
				const response = query?.data?.payload;
				return {
					widget,
					response,
					summary: summarize(response),
					isLoading: Boolean(query?.isLoading),
					isError: Boolean(query?.isError),
					refetch: (): void => {
						query?.refetch();
					},
				};
			}),
		[widgets, queries],
	);
}
