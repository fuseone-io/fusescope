import { useCallback } from 'react';
import { useQueryClient } from 'react-query';
import logEvent from 'api/common/logEvent';
import {
	getGetMetricMetadataQueryKey,
	getMetricMetadata,
} from 'api/generated/services/metrics';
import { MetrictypesTypeDTO } from 'api/generated/services/fuseScope.schemas';
import { PANEL_TYPES } from 'constants/queryBuilder';
import ROUTES from 'constants/routes';
import { useHandleExplorerTabChange } from 'hooks/useHandleExplorerTabChange';

import { MetricsExplorerEventKeys, MetricsExplorerEvents } from '../events';
import { getMetricDetailsQuery } from '../MetricDetails/utils';

/**
 * Opens a metric in the Explorer with the query its details panel builds; the
 * metadata (cached once the panel has loaded it) decides the aggregation.
 */
export function useOpenMetricInExplorer(): (
	metricName: string,
	type?: MetrictypesTypeDTO,
) => Promise<void> {
	const queryClient = useQueryClient();
	const { handleExplorerTabChange } = useHandleExplorerTabChange();

	return useCallback(
		async (metricName: string, type?: MetrictypesTypeDTO): Promise<void> => {
			const params = { metricName };
			const metadata = await queryClient
				.fetchQuery(getGetMetricMetadataQueryKey(params), ({ signal }) =>
					getMetricMetadata(params, signal),
				)
				.then((response) => response.data)
				.catch(() => undefined);

			handleExplorerTabChange(
				PANEL_TYPES.TIME_SERIES,
				{
					query: getMetricDetailsQuery(
						metricName,
						metadata?.type ?? type,
						undefined,
						undefined,
						undefined,
						metadata?.isMonotonic,
						metadata?.temporality,
					),
				},
				ROUTES.METRICS_EXPLORER_EXPLORER,
			);
			void logEvent(MetricsExplorerEvents.OpenInExplorerClicked, {
				[MetricsExplorerEventKeys.MetricName]: metricName,
				[MetricsExplorerEventKeys.Tab]: 'summary',
				[MetricsExplorerEventKeys.View]: 'list',
			});
		},
		[queryClient, handleExplorerTabChange],
	);
}
