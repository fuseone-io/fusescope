import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Binoculars, DraftingCompass, ScrollText } from '@signozhq/icons';
import {
	PanelPoint,
	PanelPointMenu,
} from 'container/WidgetCard/Panels/pointMenu.types';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import ContextMenu from 'periscope/components/ContextMenu';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { secondsToMilliseconds } from 'utils/timeUtils';

import { externalApisPath, serviceExplorerPath } from '../Tabs/util';

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
			(point: PanelPoint, onClose: () => void): JSX.Element => {
				const { startTime, endTime } = point.timeRange;
				const openExplorer = (query: Query, isLogs: boolean): void => {
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
					onClose();
				};
				const address = point.labels.address;

				return (
					<>
						<ContextMenu.Item
							icon={<DraftingCompass size={16} />}
							onClick={(): void => openExplorer(tracesQuery, false)}
						>
							View traces
						</ContextMenu.Item>
						{logsQuery && (
							<ContextMenu.Item
								icon={<ScrollText size={16} />}
								onClick={(): void => openExplorer(logsQuery, true)}
							>
								View logs
							</ContextMenu.Item>
						)}
						{externalApis && address && (
							<ContextMenu.Item
								icon={<Binoculars size={16} />}
								onClick={(): void => {
									safeNavigate(
										externalApisPath({
											servicename,
											domainName: address,
											isError: externalApis.isError,
											startTime,
											endTime,
										}),
									);
									onClose();
								}}
							>
								View External APIs
							</ContextMenu.Item>
						)}
					</>
				);
			},
		[safeNavigate, search, selectedTraceTags, servicename],
	);
}
