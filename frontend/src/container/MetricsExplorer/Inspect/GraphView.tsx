import { useEffect, useMemo, useRef, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { Color } from '@signozhq/design-tokens';
import { FsChartColor } from 'constants/fuseScopeColors';
import logEvent from 'api/common/logEvent';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Skeleton } from 'components/ui/skeleton';
import Uplot from 'components/Uplot';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useResizeObserver } from 'hooks/useDimensions';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { MetricsExplorerEventKeys, MetricsExplorerEvents } from '../events';
import { formatNumberIntoHumanReadableFormat } from '../Summary/utils';
import GraphPopover from './GraphPopover';
import HoverPopover from './HoverPopover';
import TableView from './TableView';
import { GraphPopoverOptions, GraphViewProps, InspectionStep } from './types';
import { onGraphClick, onGraphHover } from './utils';

function GraphView({
	inspectMetricsTimeSeries,
	formattedInspectMetricsTimeSeries,
	metricUnit,
	spaceAggregationSeriesMap,
	inspectionStep,
	setPopoverOptions,
	popoverOptions,
	setShowExpandedView,
	setExpandedViewOptions,
	metricInspectionAppliedOptions,
	isInspectMetricsRefetching,
}: GraphViewProps): JSX.Element {
	const isDarkMode = useIsDarkMode();
	const graphRef = useRef<HTMLDivElement>(null);
	const dimensions = useResizeObserver(graphRef);
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const start = useMemo(
		() => Math.floor(Number(minTime) / 1000000000),
		[minTime],
	);
	const end = useMemo(() => Math.floor(Number(maxTime) / 1000000000), [maxTime]);
	const [showGraphPopover, setShowGraphPopover] = useState(false);
	const [showHoverPopover, setShowHoverPopover] = useState(false);
	const [hoverPopoverOptions, setHoverPopoverOptions] =
		useState<GraphPopoverOptions | null>(null);
	const [viewType, setViewType] = useState<'graph' | 'table'>('graph');

	const popoverRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent): void {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(event.target as Node) &&
				graphRef.current &&
				!graphRef.current.contains(event.target as Node)
			) {
				setShowGraphPopover(false);
			}
		}

		document.addEventListener('mousedown', handleClickOutside);
		return (): void => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [popoverRef, graphRef]);

	const options: uPlot.Options = useMemo(
		() => ({
			width: dimensions.width,
			height: 500,
			legend: {
				show: false,
			},
			axes: [
				{
					stroke: isDarkMode ? Color.TEXT_VANILLA_400 : FsChartColor.BG_SLATE_50,
					grid: {
						show: false,
					},
					values: (_, vals): string[] =>
						vals.map((v) => {
							const d = new Date(v);
							const date = `${String(d.getDate()).padStart(2, '0')}/${String(
								d.getMonth() + 1,
							).padStart(2, '0')}`;
							const time = `${String(d.getHours()).padStart(2, '0')}:${String(
								d.getMinutes(),
							).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
							return `${date}\n${time}`; // two-line label
						}),
				},
				{
					label: metricUnit || '',
					stroke: isDarkMode ? Color.TEXT_VANILLA_400 : FsChartColor.BG_SLATE_50,
					grid: {
						show: true,
						stroke: isDarkMode
							? FsChartColor.BG_INK_200
							: FsChartColor.BG_VANILLA_300,
					},
					values: (_, vals): string[] =>
						vals.map((v) => formatNumberIntoHumanReadableFormat(v, false)),
				},
			],
			series: [
				{ label: 'Time' }, // This config is required as a placeholder for x-axis,
				...formattedInspectMetricsTimeSeries.slice(1).map((_, index) => ({
					drawStyle: 'line',
					lineInterpolation: 'spline',
					show: true,
					label: String.fromCharCode(65 + (index % 26)),
					stroke: inspectMetricsTimeSeries[index]?.strokeColor,
					width: 2,
					spanGaps: true,
					points: {
						size: 5,
						show: false,
						stroke: inspectMetricsTimeSeries[index]?.strokeColor,
					},
					scales: {
						x: {
							min: start,
							max: end,
						},
					},
				})),
			],
			hooks: {
				ready: [
					(u: uPlot): void => {
						u.over.addEventListener('click', (e) => {
							onGraphClick(
								e,
								u,
								popoverRef,
								setPopoverOptions,
								inspectMetricsTimeSeries,
								showGraphPopover,
								setShowGraphPopover,
								formattedInspectMetricsTimeSeries,
							);
						});
						u.over.addEventListener('mousemove', (e) => {
							onGraphHover(
								e,
								u,
								setHoverPopoverOptions,
								inspectMetricsTimeSeries,
								formattedInspectMetricsTimeSeries,
							);
						});
						u.over.addEventListener('mouseenter', () => {
							setShowHoverPopover(true);
						});
						u.over.addEventListener('mouseleave', () => {
							setShowHoverPopover(false);
						});
					},
				],
			},
		}),
		[
			dimensions.width,
			isDarkMode,
			metricUnit,
			formattedInspectMetricsTimeSeries,
			inspectMetricsTimeSeries,
			start,
			end,
			setPopoverOptions,
			showGraphPopover,
		],
	);

	const seriesNote =
		inspectionStep === InspectionStep.COMPLETED
			? 'Aggregated by the labels chosen in step 4'
			: 'Raw series, one line each';

	return (
		<section
			aria-label="Inspected series"
			className="inspect-metrics-graph-view tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised"
			ref={graphRef}
		>
			<div className="inspect-metrics-graph-view-header fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-4 tw:py-2.5 tw:font-sans">
				<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
					<h2 className="tw:text-sm tw:font-semibold tw:text-foreground tw:tabular-nums">
						{/* First time series in that of timestamps. Hence -1 */}
						{`${formattedInspectMetricsTimeSeries.length - 1} time series`}
					</h2>
					<span className="tw:text-xs tw:text-subtle-foreground">{seriesNote}</span>
				</div>
				<SegmentedControl
					label="View"
					size="sm"
					value={viewType}
					onChange={(newViewType): void => {
						setViewType(newViewType);
						void logEvent(MetricsExplorerEvents.InspectViewChanged, {
							[MetricsExplorerEventKeys.Tab]: 'inspect',
							[MetricsExplorerEventKeys.InspectView]: newViewType,
						});
					}}
					options={[
						{ value: 'graph', label: 'Graph' },
						{ value: 'table', label: 'Table' },
					]}
				/>
			</div>
			<div className="graph-view-container">
				{viewType === 'graph' &&
					(isInspectMetricsRefetching ? (
						<div className="fs-ui tw:p-4">
							<Skeleton className="tw:h-[480px] tw:w-full" />
						</div>
					) : (
						<Uplot data={formattedInspectMetricsTimeSeries} options={options} />
					))}

				{viewType === 'table' && (
					<TableView
						inspectionStep={inspectionStep}
						inspectMetricsTimeSeries={inspectMetricsTimeSeries}
						setShowExpandedView={setShowExpandedView}
						setExpandedViewOptions={setExpandedViewOptions}
						metricInspectionAppliedOptions={metricInspectionAppliedOptions}
						isInspectMetricsRefetching={isInspectMetricsRefetching}
					/>
				)}
			</div>
			{showGraphPopover && (
				<GraphPopover
					options={popoverOptions}
					spaceAggregationSeriesMap={spaceAggregationSeriesMap}
					popoverRef={popoverRef}
					step={inspectionStep}
					openInExpandedView={(): void => {
						setShowGraphPopover(false);
						setShowExpandedView(true);
						setExpandedViewOptions(popoverOptions);
					}}
				/>
			)}
			{showHoverPopover && !showGraphPopover && hoverPopoverOptions && (
				<HoverPopover
					options={hoverPopoverOptions}
					step={inspectionStep}
					metricInspectionAppliedOptions={metricInspectionAppliedOptions}
				/>
			)}
		</section>
	);
}

export default GraphView;
