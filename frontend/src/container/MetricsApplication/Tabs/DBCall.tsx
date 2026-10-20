import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useDispatch } from 'react-redux';
import { useLocation, useParams } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import { ENTITY_VERSION_V4 } from 'constants/app';
import { QueryParams } from 'constants/query';
import { PANEL_TYPES } from 'constants/queryBuilder';
import Graph from 'container/WidgetCard/Card';
import {
	databaseCallsAvgDuration,
	databaseCallsRPS,
} from 'container/MetricsApplication/MetricsPageQueries/DBCallQueries';
import useResourceAttribute from 'hooks/useResourceAttribute';
import {
	getResourceDeploymentKeys,
	resourceAttributesToTagFilterItems,
} from 'hooks/useResourceAttribute/utils';
import useUrlQuery from 'hooks/useUrlQuery';
import history from 'lib/history';
import { UpdateTimeInterval } from 'store/actions';
import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';
import { EQueryType } from 'types/common/dashboard';
import { v4 as uuid } from 'uuid';

import { GraphTitle, MENU_ITEMS, SERVICE_CHART_ID } from '../constant';
import { getWidgetQueryBuilder } from '../MetricsApplication.factory';
import ChartCell from '../components/ChartCell';
import ChartGrid from '../components/ChartGrid';
import ChartPanel from '../components/ChartPanel';
import DbCallsEmptyState from '../components/DbCallsEmptyState';
import { useServiceChartMenu } from '../hooks/useServiceChartMenu';
import { useStepAlignedRange } from '../hooks/useStepAlignedRange';
import { GraphContainer } from '../styles';
import { IServiceName } from './types';
import {
	handleNonInQueryRange,
	useGetAPMToLogsQueries,
	useGetAPMToTracesQueries,
} from './util';

function DBCall(): JSX.Element {
	const { start, end } = useStepAlignedRange();
	const { servicename: encodedServiceName } = useParams<IServiceName>();

	const servicename = decodeURIComponent(encodedServiceName);
	const { queries } = useResourceAttribute();
	const urlQuery = useUrlQuery();
	const { pathname } = useLocation();
	const dispatch = useDispatch();

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
		[dispatch, pathname, urlQuery],
	);

	const tagFilterItems: TagFilterItem[] = useMemo(
		() =>
			handleNonInQueryRange(resourceAttributesToTagFilterItems(queries)) || [],
		[queries],
	);

	const legend = '{{db.system}}';

	const databaseCallsRPSWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: databaseCallsRPS({
						servicename,
						legend,
						tagFilterItems,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.DATABASE_CALLS_RPS,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: 'reqps',
				id: SERVICE_CHART_ID.dbCallsRPS,
				fillSpans: false,
			}),
		[servicename, tagFilterItems, legend],
	);
	const databaseCallsAverageDurationWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: databaseCallsAvgDuration({
						servicename,
						tagFilterItems,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.DATABASE_CALLS_AVG_DURATION,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: 'ms',
				id: GraphTitle.DATABASE_CALLS_AVG_DURATION,
				fillSpans: true,
			}),
		[servicename, tagFilterItems],
	);

	const logEventCalledRef = useRef(false);

	useEffect(() => {
		if (!logEventCalledRef.current) {
			const selectedEnvironments = queries.find(
				(val) => val.tagKey === getResourceDeploymentKeys(),
			)?.tagValue;

			logEvent('APM: Service detail page visited', {
				selectedEnvironments,
				resourceAttributeUsed: !!queries?.length,
				section: 'dbMetrics',
			});
			logEventCalledRef.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const apmToTraceQuery = useGetAPMToTracesQueries({
		servicename,
		isDBCall: true,
	});
	// Unknown until the RPS chart answers; failed queries keep the charts' error.
	const [hasDbCalls, setHasDbCalls] = useState<boolean>();
	const onDbCallsData = useCallback(
		(data?: MetricRangePayloadProps['data']): void => {
			if (data) {
				setHasDbCalls(data.result.some((series) => series.values?.length > 0));
			}
		},
		[],
	);

	const apmToLogsQuery = useGetAPMToLogsQueries({ servicename });
	const menuFor = useServiceChartMenu(servicename);
	const pointMenu = useMemo(
		() => menuFor({ tracesQuery: apmToTraceQuery, logsQuery: apmToLogsQuery }),
		[menuFor, apmToTraceQuery, apmToLogsQuery],
	);

	return (
		<>
			{hasDbCalls === false && <DbCallsEmptyState />}
			<div hidden={hasDbCalls === false}>
				<ChartGrid>
					<ChartCell>
						<ChartPanel testId="database_call_rps">
							<GraphContainer>
								<Graph
									start={start}
									end={end}
									trimToEnd
									widget={databaseCallsRPSWidget}
									getGraphData={onDbCallsData}
									pointMenu={pointMenu}
									onDragSelect={onDragSelect}
									version={ENTITY_VERSION_V4}
								/>
							</GraphContainer>
						</ChartPanel>
					</ChartCell>

					<ChartCell>
						<ChartPanel testId="database_call_avg_duration">
							<GraphContainer>
								<Graph
									start={start}
									end={end}
									trimToEnd
									widget={databaseCallsAverageDurationWidget}
									headerMenuList={MENU_ITEMS}
									pointMenu={pointMenu}
									onDragSelect={onDragSelect}
									version={ENTITY_VERSION_V4}
								/>
							</GraphContainer>
						</ChartPanel>
					</ChartCell>
				</ChartGrid>
			</div>
		</>
	);
}

export default DBCall;
