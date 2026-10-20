import { useCallback, useMemo } from 'react';
import { UseQueryResult } from 'react-query';
import {
	getTimeRangeFromStepInterval,
	isApmMetric,
} from 'container/WidgetCard/Panels/utils';
import { getUplotClickData } from 'container/QueryTable/Drilldown/drilldownUtils';
import useGraphContextMenu from 'container/QueryTable/Drilldown/useGraphContextMenu';
import {
	PopoverPosition,
	useCoordinates,
} from 'periscope/components/ContextMenu';
import {
	PanelPoint,
	PanelPointMenu,
} from 'container/WidgetCard/Panels/pointMenu.types';
import { Widgets } from 'types/api/widgets/widget';
import { MetricQueryRangeSuccessResponse } from 'types/api/metrics/getQueryRange';
import { DataSource } from 'types/common/queryBuilder';

interface UseTimeSeriesContextMenuParams {
	widget: Widgets;
	queryResponse: UseQueryResult<MetricQueryRangeSuccessResponse, Error>;
	enableDrillDown?: boolean;
	pointMenu?: PanelPointMenu;
}

const DEFAULT_STEP_INTERVAL = 60;

function getPanelPoint(
	widget: Widgets,
	timestamp: number,
	metric: Record<string, string> | undefined,
): PanelPoint {
	const queryData = widget.query?.builder?.queryData?.[0];
	const step = queryData?.stepInterval || DEFAULT_STEP_INTERVAL;
	const { clickedTimestamp: _, ...labels } = metric ?? {};
	return {
		timestamp,
		timeRange: getTimeRangeFromStepInterval(
			step,
			timestamp,
			queryData?.dataSource === DataSource.METRICS &&
				isApmMetric(queryData?.aggregateAttribute?.key),
		),
		labels,
	};
}

export const usePanelContextMenu = ({
	widget,
	queryResponse,
	enableDrillDown = false,
	pointMenu,
}: UseTimeSeriesContextMenuParams): {
	coordinates: { x: number; y: number } | null;
	popoverPosition: PopoverPosition | null;
	onClose: () => void;
	menuItemsConfig: {
		header?: string | React.ReactNode;
		items?: React.ReactNode;
	};
	clickHandlerWithContextMenu: (...args: any[]) => void;
} => {
	const {
		coordinates,
		popoverPosition,
		clickedData,
		onClose,
		subMenu,
		onClick,
		setSubMenu,
	} = useCoordinates();

	const { menuItemsConfig } = useGraphContextMenu({
		widgetId: widget.id || '',
		query: widget.query,
		graphData: pointMenu ? null : clickedData,
		onClose,
		coordinates,
		subMenu,
		setSubMenu,
		contextLinks: widget.contextLinks,
		panelType: widget.panelTypes,
		queryRange: queryResponse,
	});

	const clickHandlerWithContextMenu = useCallback(
		(...args: any[]) => {
			if (pointMenu) {
				const [xValue, , , , metric, queryData, absoluteMouseX, absoluteMouseY] =
					args;
				if (queryData?.queryName) {
					onClick(
						{ x: absoluteMouseX, y: absoluteMouseY },
						getPanelPoint(widget, metric?.clickedTimestamp ?? xValue, metric),
					);
				}
				return;
			}
			if (!enableDrillDown) {
				return;
			}
			const [
				xValue,
				_yvalue,
				_mouseX,
				_mouseY,
				metric,
				queryData,
				absoluteMouseX,
				absoluteMouseY,
				axesData,
				focusedSeries,
			] = args;

			const data = getUplotClickData({
				metric,
				queryData,
				absoluteMouseX,
				absoluteMouseY,
				focusedSeries,
			});

			let timeRange;

			if (axesData && queryData?.queryName) {
				const compositeQuery = (queryResponse?.data?.params as any)?.compositeQuery;

				if (compositeQuery?.queries) {
					const specificQuery = compositeQuery.queries.find(
						(query: any) => query.spec?.name === queryData.queryName,
					);

					const stepInterval = specificQuery?.spec?.stepInterval || 60;

					timeRange = getTimeRangeFromStepInterval(
						stepInterval,
						metric?.clickedTimestamp || xValue,
						specificQuery?.spec?.signal === DataSource.METRICS &&
							isApmMetric(specificQuery?.spec?.aggregations[0]?.metricName),
					);
				}
			}

			if (data && data?.record?.queryName) {
				onClick(data.coord, {
					...data.record,
					label: data.label,
					seriesColor: data.seriesColor,
					timeRange,
				});
			}
		},
		[enableDrillDown, onClick, queryResponse, pointMenu, widget],
	);

	const pointMenuItemsConfig = useMemo(
		() =>
			pointMenu && clickedData
				? { items: pointMenu(clickedData as PanelPoint, onClose) }
				: {},
		[pointMenu, clickedData, onClose],
	);

	let activeMenuItemsConfig = {};
	if (pointMenu) {
		activeMenuItemsConfig = pointMenuItemsConfig;
	} else if (enableDrillDown) {
		activeMenuItemsConfig = menuItemsConfig;
	}

	return {
		coordinates,
		popoverPosition,
		onClose,
		menuItemsConfig: activeMenuItemsConfig,
		clickHandlerWithContextMenu,
	};
};
