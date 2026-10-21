import { useCallback, useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { Color } from '@signozhq/design-tokens';
import { FsChartColor } from 'constants/fuseScopeColors';
import logEvent from 'api/common/logEvent';
import { useGetGraphCustomSeries } from 'components/CeleryTask/useGetGraphCustomSeries';
import { useNavigateToExplorer } from 'components/CeleryTask/useNavigateToExplorer';
import MQChartPanel from 'components/MessagingQueues/MQChartPanel/MQChartPanel';
import { Button } from 'container/MetricsApplication/Tabs/styles';
import { QueryParams } from 'constants/query';
import { ViewMenuAction } from 'container/WidgetCard/config';
import GridCard from 'container/WidgetCard/Card';
import { useGraphClickHandler } from 'container/MetricsApplication/Tabs/util';
import useUrlQuery from 'hooks/useUrlQuery';
import { OnClickPluginOpts } from 'lib/uPlotLib/plugins/onClickPlugin';
import { UpdateTimeInterval } from 'store/actions';
import { AppState } from 'store/reducers';
import { Widgets } from 'types/api/widgets/widget';
import { BaseAutocompleteData } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';
import { GlobalReducer } from 'types/reducer/globalTime';

import {
	celeryOverviewAvgLatencyGraphData,
	celeryOverviewErrorRateGraphData,
	celeryOverviewRequestRateGraphData,
} from '../CeleryOverviewGraphUtils';

export default function OverviewRightPanelGraph({
	groupByFilter,
	filters,
}: {
	groupByFilter?: BaseAutocompleteData;
	filters?: TagFilterItem[];
}): JSX.Element {
	const history = useHistory();
	const { pathname } = useLocation();
	const dispatch = useDispatch();
	const urlQuery = useUrlQuery();

	const onDragSelect = useCallback(
		(start: number, end: number) => {
			const startTimestamp = Math.trunc(start);
			const endTimestamp = Math.trunc(end);

			urlQuery.set(QueryParams.startTime, startTimestamp.toString());
			urlQuery.set(QueryParams.endTime, endTimestamp.toString());
			const generatedUrl = `${pathname}?${urlQuery.toString()}`;
			history.push(generatedUrl);

			if (startTimestamp !== endTimestamp) {
				dispatch(UpdateTimeInterval('custom', [startTimestamp, endTimestamp]));
			}
		},
		[dispatch, history, pathname, urlQuery],
	);

	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const requestRateWidget = useMemo(
		() =>
			celeryOverviewRequestRateGraphData(minTime, maxTime, filters, groupByFilter),
		[minTime, maxTime, filters, groupByFilter],
	);

	const errorRateWidget = useMemo(
		() =>
			celeryOverviewErrorRateGraphData(minTime, maxTime, filters, groupByFilter),
		[minTime, maxTime, filters, groupByFilter],
	);

	const avgLatencyWidget = useMemo(
		() =>
			celeryOverviewAvgLatencyGraphData(minTime, maxTime, filters, groupByFilter),
		[minTime, maxTime, filters, groupByFilter],
	);
	const [selectedTimeStamp, setSelectedTimeStamp] = useState<number>(0);

	const handleSetTimeStamp = useCallback((selectTime: number) => {
		setSelectedTimeStamp(selectTime);
	}, []);

	const navigateToExplorer = useNavigateToExplorer();

	const onGraphClickHandler = useGraphClickHandler(handleSetTimeStamp);

	const handleGraphClick = useCallback(
		(type: string): OnClickPluginOpts['onClick'] =>
			(xValue, yValue, mouseX, mouseY): Promise<void> =>
				onGraphClickHandler(xValue, yValue, mouseX, mouseY, type),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[handleSetTimeStamp],
	);

	const goToTraces = useCallback(
		(widget: Widgets) => {
			const { stepInterval } = widget?.query?.builder?.queryData?.[0] ?? {};
			navigateToExplorer({
				filters: filters ?? [],
				dataSource: DataSource.TRACES,
				startTime: selectedTimeStamp,
				endTime: selectedTimeStamp + (stepInterval ?? 60),
			});
		},
		[navigateToExplorer, filters, selectedTimeStamp],
	);

	const { getCustomSeries } = useGetGraphCustomSeries({
		isDarkMode: false,
		drawStyle: 'bars',
		colorMapping: {
			True: Color.BG_CHERRY_500,
			False: Color.BG_FOREST_400,
			None: FsChartColor.BG_SLATE_200,
			'Request Rate': FsChartColor.BG_ROBIN_500,
		},
	});

	const [requestRateStatus, setRequestRateStatus] = useState<boolean | null>(
		null,
	);
	const [errorRateStatus, setErrorRateStatus] = useState<boolean | null>(null);
	const [avgLatencyStatus, setAvgLatencyStatus] = useState<boolean | null>(null);

	useEffect(() => {
		if (
			requestRateStatus !== null &&
			errorRateStatus !== null &&
			avgLatencyStatus !== null
		) {
			logEvent('MQ Overview Page: Right Drawer - graphs', {
				requestRate: requestRateStatus,
				errorRate: errorRateStatus,
				avgLatency: avgLatencyStatus,
			});
		}
	}, [requestRateStatus, errorRateStatus, avgLatencyStatus]);

	const charts = [
		{
			id: 'Celery_request_rate',
			widget: requestRateWidget,
			customSeries: getCustomSeries,
			setStatus: setRequestRateStatus,
		},
		{
			id: 'Celery_error_rate',
			widget: errorRateWidget,
			customSeries: getCustomSeries,
			setStatus: setErrorRateStatus,
		},
		{
			id: 'Celery_avg_latency',
			widget: avgLatencyWidget,
			customSeries: undefined,
			setStatus: setAvgLatencyStatus,
		},
	];

	return (
		<div className="tw:flex tw:flex-col tw:gap-4">
			{charts.map(({ id, widget, customSeries, setStatus }) => (
				<MQChartPanel key={id} testId={id} height="medium">
					<Button
						type="default"
						size="small"
						id={`${id}_button`}
						onClick={(): void => goToTraces(widget)}
					>
						View Traces
					</Button>
					<GridCard
						widget={widget}
						headerMenuList={[...ViewMenuAction]}
						onDragSelect={onDragSelect}
						onClickHandler={handleGraphClick(id)}
						customSeries={customSeries}
						dataAvailable={(isDataAvailable: boolean): void => {
							setStatus(isDataAvailable);
						}}
					/>
				</MQChartPanel>
			))}
		</div>
	);
}

OverviewRightPanelGraph.defaultProps = {
	groupByFilter: undefined,
	filters: undefined,
};
