import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ChartPointAction } from 'components/ChartPointPopover/types';
import {
	PanelPoint,
	PanelPointMenu,
	PanelPointMenuContent,
} from 'container/WidgetCard/Panels/pointMenu.types';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { Binoculars, DraftingCompass, ScrollText } from 'lucide-react';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { secondsToMilliseconds } from 'utils/timeUtils';

import { externalApisPath, serviceExplorerPath } from '../Tabs/util';
import { servicePointContext } from './pointContext';

export interface ServiceChartMenuTargets {
	tracesQuery: Query;
	logsQuery?: Query;
	/** Adds External APIs for the clicked series' `address`. */
	externalApis?: { isError: boolean };
}

/**
 * Builds the menu a service chart opens on a point click: the service's
 * traces and logs in the clicked bucket, under the page's resource filters.
 */
export function useServiceChartMenu(
	servicename: string,
): (targets: ServiceChartMenuTargets) => PanelPointMenu {
	const { search } = useLocation();
	const { safeNavigate } = useSafeNavigate();
	const { queries } = useResourceAttribute();

	const selectedTraceTags = useMemo(
		() => JSON.stringify(convertRawQueriesToTraceSelectedTags(queries) || []),
		[queries],
	);

	return useCallback(
		({ tracesQuery, logsQuery, externalApis }: ServiceChartMenuTargets) =>
			(point: PanelPoint): PanelPointMenuContent => {
				const { startTime, endTime } = point.timeRange;
				const openExplorer = (query: Query, isLogs: boolean): void =>
					safeNavigate(
						serviceExplorerPath({
							isLogs,
							search,
							servicename,
							selectedTraceTags,
							query,
							startTimeMs: secondsToMilliseconds(startTime),
							endTimeMs: secondsToMilliseconds(endTime),
						}),
					);
				const address = point.labels.address;

				const actions: ChartPointAction[] = [
					{
						key: 'traces',
						label: 'View traces at this time',
						icon: <DraftingCompass />,
						onSelect: (): void => openExplorer(tracesQuery, false),
					},
				];
				if (logsQuery) {
					actions.push({
						key: 'logs',
						label: 'View logs at this time',
						icon: <ScrollText />,
						onSelect: (): void => openExplorer(logsQuery, true),
					});
				}
				if (externalApis && address) {
					actions.push({
						key: 'external-apis',
						label: 'View External APIs',
						icon: <Binoculars />,
						onSelect: (): void =>
							safeNavigate(
								externalApisPath({
									servicename,
									domainName: address,
									isError: externalApis.isError,
									startTime,
									endTime,
								}),
							),
					});
				}

				return {
					actions,
					context: servicePointContext(point, servicename, queries),
				};
			},
		[safeNavigate, search, selectedTraceTags, servicename, queries],
	);
}
