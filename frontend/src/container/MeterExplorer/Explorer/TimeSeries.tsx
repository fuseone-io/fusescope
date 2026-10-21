import { useMemo, useRef } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import QueryCancelledPlaceholder from 'components/QueryCancelledPlaceholder';
import { Skeleton } from 'components/ui/skeleton';
import { BuilderUnitsFilter } from 'container/QueryBuilder/filters/BuilderUnitsFilter';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useResizeObserver } from 'hooks/useDimensions';
import useUrlYAxisUnit from 'hooks/useUrlYAxisUnit';
import { prepareChartData } from 'lib/uPlotV2/utils/dataUtils';
import { useTimezone } from 'providers/Timezone';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';
import uPlot from 'uplot';

import { describeMeterQueryData } from '../describeMeterQuery';
import { buildMeterChartConfig } from './configBuilder';
import EmptyMeterSearch from './EmptyMeterSearch';
import MeterResultChart from './MeterResultChart';
import styles from './TimeSeries.module.scss';
import { useTimeSeriesQueries } from './useTimeSeriesQueries';
import { useTimeSeriesTimeManagement } from './useTimeSeriesTimeManagement';

const WIDGET_ID = 'meter-explorer-bar-chart';

interface TimeSeriesProps {
	onFetchingStateChange?: (isFetching: boolean) => void;
	isCancelled?: boolean;
}

function TimeSeries({
	onFetchingStateChange,
	isCancelled = false,
}: TimeSeriesProps): JSX.Element {
	const graphRef = useRef<HTMLDivElement>(null);

	const { stagedQuery, currentQuery } = useQueryBuilder();
	const { yAxisUnit, onUnitChange } = useUrlYAxisUnit('');

	const isDarkMode = useIsDarkMode();
	const { timezone } = useTimezone();
	const containerDimensions = useResizeObserver(graphRef);

	const {
		selectedTime: globalSelectedTime,
		maxTime,
		minTime,
	} = useSelector<AppState, GlobalReducer>((state) => state.globalTime);

	const { minTimeScale, maxTimeScale, onDragSelect } =
		useTimeSeriesTimeManagement({
			globalSelectedTime,
			maxTime,
			minTime,
		});

	const { responseData, isLoading, isError } = useTimeSeriesQueries({
		stagedQuery,
		currentQuery,
		globalSelectedTime,
		maxTime,
		minTime,
		onFetchingStateChange,
	});

	const hasMetricSelected = useMemo(
		() => currentQuery.builder.queryData.some((q) => q.aggregateAttribute?.key),
		[currentQuery],
	);

	const unit = yAxisUnit || 'short';

	const chartsData = useMemo(
		() =>
			responseData.map((response, index) => {
				const apiResponse = response?.payload;
				const config = buildMeterChartConfig({
					id: `${WIDGET_ID}-${index}`,
					isDarkMode,
					currentQuery,
					onDragSelect,
					apiResponse,
					timezone,
					yAxisUnit: unit,
					minTimeScale,
					maxTimeScale,
				});
				const chartData = apiResponse ? prepareChartData(apiResponse) : [];
				return {
					config,
					chartData,
					apiResponse,
					hasData: chartData.length > 0 && chartData[0]?.length > 0,
				};
			}),
		[
			responseData,
			currentQuery,
			unit,
			isDarkMode,
			onDragSelect,
			timezone,
			minTimeScale,
			maxTimeScale,
		],
	);

	const hasAnyData = chartsData.some((chart) => chart.hasData);
	const title =
		(stagedQuery && describeMeterQueryData(stagedQuery.builder.queryData)) ||
		'No query yet';
	const showChart =
		!isCancelled && hasMetricSelected && !isLoading && !isError && hasAnyData;

	return (
		<ContentPanel
			testId="meter-explorer-result"
			title={<span className="tw:font-mono tw:text-[13px]">{title}</span>}
			actions={
				<div className={styles.unitFilter}>
					<BuilderUnitsFilter onChange={onUnitChange} yAxisUnit={yAxisUnit} />
				</div>
			}
		>
			<div className={styles.timeSeriesContainer} ref={graphRef}>
				{!hasMetricSelected && <EmptyMeterSearch />}
				{isCancelled && hasMetricSelected && (
					<QueryCancelledPlaceholder subText='Click "Run Query" to load metrics.' />
				)}
				{isLoading && hasMetricSelected && !isCancelled && (
					<Skeleton
						data-testid="meter-explorer-loading"
						className="tw:h-full tw:w-full tw:bg-muted"
					/>
				)}
				{!isCancelled &&
					hasMetricSelected &&
					!isLoading &&
					!isError &&
					!hasAnyData && (
						<EmptyMeterSearch hasQueryResult={responseData[0] !== undefined} />
					)}
				{showChart &&
					containerDimensions.width > 0 &&
					containerDimensions.height > 0 &&
					chartsData.map(
						(chart, index) =>
							chart.hasData && (
								<MeterResultChart
									// oxlint-disable-next-line react/no-array-index-key -- query responses have no stable ID
									key={`${WIDGET_ID}-${index}`}
									config={chart.config}
									data={chart.chartData as uPlot.AlignedData}
									response={chart.apiResponse}
									width={containerDimensions.width}
									height={containerDimensions.height}
									yAxisUnit={unit}
									timezone={timezone}
								/>
							),
					)}
			</div>
		</ContentPanel>
	);
}

export default TimeSeries;
