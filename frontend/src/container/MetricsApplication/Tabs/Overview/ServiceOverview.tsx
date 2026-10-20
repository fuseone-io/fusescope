import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ENTITY_VERSION_V4 } from 'constants/app';
import { FeatureKeys } from 'constants/features';
import { PANEL_TYPES } from 'constants/queryBuilder';
import Graph from 'container/WidgetCard/Card';
import { useStepAlignedRange } from 'container/MetricsApplication/hooks/useStepAlignedRange';
import {
	GraphTitle,
	SERVICE_CHART_ID,
} from 'container/MetricsApplication/constant';
import { getWidgetQueryBuilder } from 'container/MetricsApplication/MetricsApplication.factory';
import { latency } from 'container/MetricsApplication/MetricsPageQueries/OverviewQueries';
import ChartPanel from 'container/MetricsApplication/components/ChartPanel';
import { PanelPointMenu } from 'container/WidgetCard/Panels/pointMenu.types';
import { GraphContainer } from 'container/MetricsApplication/styles';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { resourceAttributesToTagFilterItems } from 'hooks/useResourceAttribute/utils';
import { useAppContext } from 'providers/App/App';
import { EQueryType } from 'types/common/dashboard';
import { v4 as uuid } from 'uuid';

import { IServiceName } from '../types';
import { handleNonInQueryRange } from '../util';

function ServiceOverview({
	onDragSelect,
	pointMenu,
	topLevelOperationsRoute,
	topLevelOperationsIsLoading,
}: ServiceOverviewProps): JSX.Element {
	const { start, end } = useStepAlignedRange();
	const { servicename: encodedServiceName } = useParams<IServiceName>();
	const servicename = decodeURIComponent(encodedServiceName);

	const { featureFlags } = useAppContext();
	const isSpanMetricEnable =
		featureFlags?.find((flag) => flag.name === FeatureKeys.USE_SPAN_METRICS)
			?.active || false;

	const { queries } = useResourceAttribute();

	const tagFilterItems = useMemo(
		() =>
			handleNonInQueryRange(
				resourceAttributesToTagFilterItems(queries, !isSpanMetricEnable),
			) || [],
		[isSpanMetricEnable, queries],
	);

	const latencyWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: latency({
						servicename,
						tagFilterItems,
						isSpanMetricEnable,
						topLevelOperationsRoute,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.LATENCY,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: 'ns',
				id: SERVICE_CHART_ID.latency,
			}),
		[isSpanMetricEnable, servicename, tagFilterItems, topLevelOperationsRoute],
	);

	const isQueryEnabled =
		!topLevelOperationsIsLoading && topLevelOperationsRoute.length > 0;

	return (
		<ChartPanel testId="service_latency">
			<GraphContainer>
				<Graph
					start={start}
					end={end}
					trimToEnd
					onDragSelect={onDragSelect}
					widget={latencyWidget}
					pointMenu={pointMenu}
					isQueryEnabled={isQueryEnabled}
					version={ENTITY_VERSION_V4}
				/>
			</GraphContainer>
		</ChartPanel>
	);
}
interface ServiceOverviewProps {
	onDragSelect: (start: number, end: number) => void;
	pointMenu: PanelPointMenu;
	topLevelOperationsRoute: string[];
	topLevelOperationsIsLoading: boolean;
}

export default ServiceOverview;
