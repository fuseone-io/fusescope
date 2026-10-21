import { useCallback, useMemo, useRef, useState } from 'react';
import { UseQueryResult } from 'react-query';
import ChartHeaderLegend from 'components/PageTemplate/components/ChartHeaderLegend';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { useSeriesVisibility } from 'components/PageTemplate/hooks/useSeriesVisibility';
import { Skeleton } from 'components/ui/skeleton';
import { useNavigateToExplorer } from 'components/CeleryTask/useNavigateToExplorer';
import {
	getCustomFiltersForBarChart,
	getFormattedEndPointStatusCodeChartData,
	getStatusCodeBarChartWidgetData,
	statusCodeWidgetInfo,
} from 'container/ApiMonitoring/utils';
import BarChart from 'lib/visualization/charts/BarChart/BarChart';
import { handleGraphClick } from 'container/WidgetCard/Card/utils';
import { useGraphClickToShowButton } from 'container/WidgetCard/hooks/useGraphClickToShowButton';
import useNavigateToExplorerPages from 'container/WidgetCard/hooks/useNavigateToExplorerPages';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useResizeObserver } from 'hooks/useDimensions';
import { useNotifications } from 'hooks/useNotifications';
import { getUPlotChartData } from 'lib/uPlotLib/utils/getUplotChartData';
import { LegendPosition } from 'lib/uPlotV2/components/types';
import { useTimezone } from 'providers/Timezone';
import { SuccessResponse } from 'types/api';
import { Widgets } from 'types/api/widgets/widget';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';

import { STATUS_RANGES, statusRangeColors } from '../../../../statusRanges';
import ErrorState from './ErrorState';
import {
	getStepIntervalForQuery,
	getTracesTimeRangeFromStepInterval,
	prepareStatusCodeBarChartsConfig,
} from './utils';

function StatusCodeBarCharts({
	endPointStatusCodeBarChartsDataQuery,
	endPointStatusCodeLatencyBarChartsDataQuery,
	domainName,
	filters,
	timeRange,
	onDragSelect,
}: {
	endPointStatusCodeBarChartsDataQuery: UseQueryResult<
		SuccessResponse<any>,
		unknown
	>;
	endPointStatusCodeLatencyBarChartsDataQuery: UseQueryResult<
		SuccessResponse<any>,
		unknown
	>;
	domainName: string;
	filters: IBuilderQuery['filters'];
	timeRange: {
		startTime: number;
		endTime: number;
	};
	onDragSelect: (start: number, end: number) => void;
}): JSX.Element {
	// 0 : Status Code Count
	// 1 : Status Code Latency
	const [currentWidgetInfoIndex, setCurrentWidgetInfoIndex] = useState(0);

	const { data: endPointStatusCodeBarChartsData } =
		endPointStatusCodeBarChartsDataQuery;

	const { data: endPointStatusCodeLatencyBarChartsData } =
		endPointStatusCodeLatencyBarChartsDataQuery;

	const { startTime: minTime, endTime: maxTime } = timeRange;

	const graphRef = useRef<HTMLDivElement>(null);
	const dimensions = useResizeObserver(graphRef);
	const formattedEndPointStatusCodeBarChartsDataPayload = useMemo(
		() =>
			getFormattedEndPointStatusCodeChartData(
				endPointStatusCodeBarChartsData?.payload,
				'sum',
			),
		[endPointStatusCodeBarChartsData?.payload],
	);

	const formattedEndPointStatusCodeLatencyBarChartsDataPayload = useMemo(
		() =>
			getFormattedEndPointStatusCodeChartData(
				endPointStatusCodeLatencyBarChartsData?.payload,
				'average',
			),
		[endPointStatusCodeLatencyBarChartsData?.payload],
	);

	const chartData = useMemo(
		() =>
			getUPlotChartData(
				currentWidgetInfoIndex === 0
					? formattedEndPointStatusCodeBarChartsDataPayload
					: formattedEndPointStatusCodeLatencyBarChartsDataPayload,
			),
		[
			currentWidgetInfoIndex,
			formattedEndPointStatusCodeBarChartsDataPayload,
			formattedEndPointStatusCodeLatencyBarChartsDataPayload,
		],
	);

	const isDarkMode = useIsDarkMode();

	const graphClick = useGraphClickToShowButton({
		graphRef,
		isButtonEnabled: true,
		buttonClassName: 'view-onclick-show-button',
	});

	const navigateToExplorer = useNavigateToExplorer();
	const { currentQuery } = useQueryBuilder();
	const { timezone } = useTimezone();

	const navigateToExplorerPages = useNavigateToExplorerPages();
	const { notifications } = useNotifications();

	const colorMapping = useMemo(
		() => statusRangeColors(isDarkMode),
		[isDarkMode],
	);
	const { plotRef, hidden, toggle } = useSeriesVisibility();

	const widget = useMemo<Widgets>(
		() =>
			getStatusCodeBarChartWidgetData(domainName, {
				items: [...(filters?.items || [])],
				op: filters?.op || 'AND',
			}),
		[domainName, filters],
	);

	const activeApiResponse = useMemo(
		() =>
			currentWidgetInfoIndex === 0
				? formattedEndPointStatusCodeBarChartsDataPayload
				: formattedEndPointStatusCodeLatencyBarChartsDataPayload,
		[
			currentWidgetInfoIndex,
			formattedEndPointStatusCodeBarChartsDataPayload,
			formattedEndPointStatusCodeLatencyBarChartsDataPayload,
		],
	);

	const graphClickHandler = useCallback(
		(
			xValue: number,
			yValue: number,
			mouseX: number,
			mouseY: number,
			metric?: { [key: string]: string },
			queryData?: { queryName: string; inFocusOrNot: boolean },
		): void => {
			const customFilters = getCustomFiltersForBarChart(metric);
			const stepInterval = getStepIntervalForQuery(
				activeApiResponse,
				queryData?.queryName,
			);
			const { start, end } = getTracesTimeRangeFromStepInterval(
				xValue,
				stepInterval,
			);

			handleGraphClick({
				xValue,
				yValue,
				mouseX,
				mouseY,
				metric,
				queryData,
				widget,
				navigateToExplorerPages,
				navigateToExplorer,
				notifications,
				graphClick,
				customFilters,
				customTracesTimeRange: {
					start,
					end,
				},
			});
		},
		[
			activeApiResponse,
			widget,
			navigateToExplorerPages,
			navigateToExplorer,
			notifications,
			graphClick,
		],
	);

	const config = useMemo(() => {
		const apiResponse =
			currentWidgetInfoIndex === 0
				? formattedEndPointStatusCodeBarChartsDataPayload
				: formattedEndPointStatusCodeLatencyBarChartsDataPayload;
		return prepareStatusCodeBarChartsConfig({
			timezone,
			isDarkMode,
			query: currentQuery,
			onDragSelect,
			onClick: graphClickHandler,
			apiResponse,
			minTimeScale: minTime,
			maxTimeScale: maxTime,
			yAxisUnit: statusCodeWidgetInfo[currentWidgetInfoIndex].yAxisUnit,
			colorMapping,
		});
	}, [
		currentQuery,
		isDarkMode,
		minTime,
		maxTime,
		graphClickHandler,
		onDragSelect,
		formattedEndPointStatusCodeBarChartsDataPayload,
		formattedEndPointStatusCodeLatencyBarChartsDataPayload,
		timezone,
		currentWidgetInfoIndex,
		colorMapping,
	]);

	const presentRanges = useMemo(
		() =>
			new Set(
				(activeApiResponse?.data?.result ?? []).map((series) =>
					String(series.metric?.response_status_code ?? ''),
				),
			),
		[activeApiResponse],
	);

	const renderCardContent = useCallback(
		(query: UseQueryResult<SuccessResponse<any>, unknown>): JSX.Element => {
			if (query.isLoading) {
				return (
					<Skeleton
						data-testid="status-code-chart-loading"
						className="tw:h-full tw:w-full tw:bg-muted"
					/>
				);
			}

			if (query.error) {
				return <ErrorState refetch={query.refetch} />;
			}
			return (
				<div className="chart-container tw:h-full">
					<BarChart
						config={config}
						data={chartData}
						width={dimensions.width}
						height={dimensions.height}
						timezone={timezone}
						showLegend={false}
						plotRef={plotRef}
						legendConfig={{
							position: LegendPosition.BOTTOM,
						}}
					/>
				</div>
			);
		},
		[config, chartData, dimensions, timezone, plotRef],
	);

	return (
		<ContentPanel
			testId="status-code-bar-charts"
			className="tw:min-h-[300px]"
			title={
				<>
					Call response status
					<span className="tw:font-normal tw:text-subtle-foreground">
						{currentWidgetInfoIndex === 0 ? '· calls' : '· p99 latency'}
					</span>
				</>
			}
			subtitle={
				<ChartHeaderLegend
					items={STATUS_RANGES.map((range) => ({
						key: range.key,
						label: range.label,
						color: colorMapping[range.key],
						muted: !presentRanges.has(range.key),
					}))}
					hidden={hidden}
					onToggle={toggle}
					className="tw:mt-1"
				/>
			}
			actions={
				<SegmentedControl
					label="Measure"
					size="sm"
					value={currentWidgetInfoIndex === 0 ? 'calls' : 'latency'}
					onChange={(value): void =>
						setCurrentWidgetInfoIndex(value === 'calls' ? 0 : 1)
					}
					options={[
						{ value: 'calls', label: 'Calls', testId: 'status-chart-calls' },
						{ value: 'latency', label: 'Latency', testId: 'status-chart-latency' },
					]}
				/>
			}
		>
			<div className="graph-container tw:h-[200px] tw:px-3 tw:pb-3" ref={graphRef}>
				{renderCardContent(endPointStatusCodeBarChartsDataQuery)}
			</div>
		</ContentPanel>
	);
}
export default StatusCodeBarCharts;
