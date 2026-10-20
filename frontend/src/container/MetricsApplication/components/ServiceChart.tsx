import { ReactNode, useMemo } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Skeleton } from 'components/ui/skeleton';
import { ENTITY_VERSION_V4 } from 'constants/app';
import Graph from 'container/WidgetCard/Card';
import { MenuItemKeys } from 'container/WidgetCard/Header/contants';
import { PanelPointMenu } from 'container/WidgetCard/Panels/pointMenu.types';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { Widgets } from 'types/api/widgets/widget';

import { useStepAlignedRange } from '../hooks/useStepAlignedRange';
import { withPreviousPeriod } from '../MetricsPageQueries/previousPeriod';
import ChartLegend from './ChartLegend';
import CreateAlertButton from './CreateAlertButton';
import { chartColors, ChartSeriesSpec } from './serviceChartSeries';

const MENU = [MenuItemKeys.View, MenuItemKeys.CreateAlerts];

interface ServiceChartProps {
	title: string;
	unit?: ReactNode;
	testId: string;
	widget: Widgets;
	series: ChartSeriesSpec;
	/** Draws the previous period dashed under the current one. */
	compare: boolean;
	pointMenu: PanelPointMenu;
	onDragSelect: (start: number, end: number) => void;
	isQueryEnabled: boolean;
	loading?: boolean;
	threshold?: ReactNode;
	/** Next to the title, e.g. a help tip. */
	titleAddon?: ReactNode;
}

/**
 * A service chart in a `ContentPanel`: title, unit and legend in the header
 * with Create alert, the chart below with its point drilldown, and the
 * previous period as dashed series when comparing.
 */
function ServiceChart({
	title,
	unit,
	testId,
	widget,
	series,
	compare,
	pointMenu,
	onDragSelect,
	isQueryEnabled,
	loading = false,
	threshold,
	titleAddon,
}: ServiceChartProps): JSX.Element {
	const { start, end } = useStepAlignedRange();
	const { seconds } = useApmWindow();
	const isDarkMode = useIsDarkMode();

	const { colors, entries } = useMemo(
		() => chartColors(series, compare, isDarkMode),
		[series, compare, isDarkMode],
	);

	const chartWidget = useMemo((): Widgets => {
		const shifted = compare
			? withPreviousPeriod(widget.query.builder, seconds, {
					legends: series.compared,
				})
			: { builder: widget.query.builder, dashedQueryNames: [] };
		return {
			...widget,
			title: '',
			query: { ...widget.query, builder: shifted.builder },
			dashedQueryNames: shifted.dashedQueryNames,
			customLegendColors: colors,
			showLegend: false,
		};
	}, [widget, compare, seconds, series.compared, colors]);

	return (
		<ContentPanel
			testId={testId}
			title={
				<>
					{title}
					{unit && (
						<span className="tw:font-normal tw:text-subtle-foreground">· {unit}</span>
					)}
					{titleAddon}
				</>
			}
			actions={
				<>
					<ChartLegend entries={entries} />
					<CreateAlertButton widget={widget} testId={`${testId}-create-alert`} />
				</>
			}
			bodyClassName="tw:h-[280px] tw:flex-none tw:px-3 tw:pb-3"
		>
			{loading ? (
				<Skeleton className="tw:h-full tw:w-full tw:bg-muted" />
			) : (
				<Graph
					start={start}
					end={end}
					trimToEnd
					widget={chartWidget}
					headerMenuList={MENU}
					pointMenu={pointMenu}
					onDragSelect={onDragSelect}
					isQueryEnabled={isQueryEnabled}
					threshold={threshold}
					version={ENTITY_VERSION_V4}
				/>
			)}
		</ContentPanel>
	);
}

export default ServiceChart;
