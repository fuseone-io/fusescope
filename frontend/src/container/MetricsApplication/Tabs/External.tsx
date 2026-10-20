import { useCallback, useEffect, useMemo, useRef } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useDispatch } from 'react-redux';
import { useLocation, useParams } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import { ENTITY_VERSION_V4 } from 'constants/app';
import { QueryParams } from 'constants/query';
import { PANEL_TYPES } from 'constants/queryBuilder';
import Graph from 'container/WidgetCard/Card';
import {
	externalCallDuration,
	externalCallDurationByAddress,
	externalCallErrorPercent,
	externalCallRpsByAddress,
} from 'container/MetricsApplication/MetricsPageQueries/ExternalQueries';
import useResourceAttribute from 'hooks/useResourceAttribute';
import {
	getResourceDeploymentKeys,
	resourceAttributesToTagFilterItems,
} from 'hooks/useResourceAttribute/utils';
import useUrlQuery from 'hooks/useUrlQuery';
import history from 'lib/history';
import { UpdateTimeInterval } from 'store/actions';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { EQueryType } from 'types/common/dashboard';
import { v4 as uuid } from 'uuid';

import { GraphTitle, legend, MENU_ITEMS } from '../constant';
import { getWidgetQueryBuilder } from '../MetricsApplication.factory';
import ChartCell from '../components/ChartCell';
import ChartGrid from '../components/ChartGrid';
import ChartPanel from '../components/ChartPanel';
import { useServiceChartMenu } from '../hooks/useServiceChartMenu';
import { GraphContainer } from '../styles';
import { IServiceName } from './types';
import {
	handleNonInQueryRange,
	useGetAPMToLogsQueries,
	useGetAPMToTracesQueries,
} from './util';

function External(): JSX.Element {
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

	const tagFilterItems = useMemo(
		() =>
			handleNonInQueryRange(resourceAttributesToTagFilterItems(queries)) || [],
		[queries],
	);

	const externalCallErrorWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: externalCallErrorPercent({
						servicename,
						legend: legend.address,
						tagFilterItems,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.EXTERNAL_CALL_ERROR_PERCENTAGE,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: '%',
				id: GraphTitle.EXTERNAL_CALL_ERROR_PERCENTAGE,
			}),
		[servicename, tagFilterItems],
	);

	const externalCallDurationWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: externalCallDuration({
						servicename,
						tagFilterItems,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.EXTERNAL_CALL_DURATION,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: 'ms',
				id: GraphTitle.EXTERNAL_CALL_DURATION,
				fillSpans: true,
			}),
		[servicename, tagFilterItems],
	);

	const errorApmToTraceQuery = useGetAPMToTracesQueries({
		servicename,
		isExternalCall: true,
		filters: [
			{
				id: uuid().slice(0, 8),
				key: {
					key: 'hasError',
					dataType: DataTypes.bool,
					type: 'tag',
					id: 'hasError--bool--tag--true',
				},
				op: 'in',
				value: ['true'],
			},
		],
	});

	const logEventCalledRef = useRef(false);
	useEffect(() => {
		if (!logEventCalledRef.current) {
			const selectedEnvironments = queries.find(
				(val) => val.tagKey === getResourceDeploymentKeys(),
			)?.tagValue;

			logEvent('APM: Service detail page visited', {
				selectedEnvironments,
				resourceAttributeUsed: !!queries?.length,
				section: 'externalMetrics',
			});
			logEventCalledRef.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const externalCallRPSWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: externalCallRpsByAddress({
						servicename,
						legend: legend.address,
						tagFilterItems,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.EXTERNAL_CALL_RPS_BY_ADDRESS,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: 'reqps',
				id: GraphTitle.EXTERNAL_CALL_RPS_BY_ADDRESS,
				fillSpans: true,
			}),
		[servicename, tagFilterItems],
	);

	const externalCallDurationAddressWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: externalCallDurationByAddress({
						servicename,
						legend: legend.address,
						tagFilterItems,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.EXTERNAL_CALL_DURATION_BY_ADDRESS,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: 'ms',
				id: GraphTitle.EXTERNAL_CALL_DURATION_BY_ADDRESS,
				fillSpans: true,
			}),
		[servicename, tagFilterItems],
	);

	const apmToTraceQuery = useGetAPMToTracesQueries({
		servicename,
		isExternalCall: true,
	});

	const apmToLogsQuery = useGetAPMToLogsQueries({ servicename });
	const menuFor = useServiceChartMenu(servicename);
	const errorMenu = useMemo(
		() =>
			menuFor({
				tracesQuery: errorApmToTraceQuery,
				logsQuery: apmToLogsQuery,
				externalApis: { isError: true },
			}),
		[menuFor, errorApmToTraceQuery, apmToLogsQuery],
	);
	const callsMenu = useMemo(
		() =>
			menuFor({
				tracesQuery: apmToTraceQuery,
				logsQuery: apmToLogsQuery,
				externalApis: { isError: false },
			}),
		[menuFor, apmToTraceQuery, apmToLogsQuery],
	);

	return (
		<ChartGrid>
			<ChartCell>
				<ChartPanel testId="external_call_error_percentage">
					<GraphContainer>
						<Graph
							headerMenuList={MENU_ITEMS}
							widget={externalCallErrorWidget}
							pointMenu={errorMenu}
							onDragSelect={onDragSelect}
							version={ENTITY_VERSION_V4}
						/>
					</GraphContainer>
				</ChartPanel>
			</ChartCell>

			<ChartCell>
				<ChartPanel testId="external_call_duration">
					<GraphContainer>
						<Graph
							headerMenuList={MENU_ITEMS}
							widget={externalCallDurationWidget}
							pointMenu={callsMenu}
							onDragSelect={onDragSelect}
							version={ENTITY_VERSION_V4}
						/>
					</GraphContainer>
				</ChartPanel>
			</ChartCell>

			<ChartCell>
				<ChartPanel testId="external_call_rps_by_address">
					<GraphContainer>
						<Graph
							widget={externalCallRPSWidget}
							headerMenuList={MENU_ITEMS}
							pointMenu={callsMenu}
							onDragSelect={onDragSelect}
							version={ENTITY_VERSION_V4}
						/>
					</GraphContainer>
				</ChartPanel>
			</ChartCell>

			<ChartCell>
				<ChartPanel testId="external_call_duration_by_address">
					<GraphContainer>
						<Graph
							widget={externalCallDurationAddressWidget}
							headerMenuList={MENU_ITEMS}
							pointMenu={callsMenu}
							onDragSelect={onDragSelect}
							version={ENTITY_VERSION_V4}
						/>
					</GraphContainer>
				</ChartPanel>
			</ChartCell>
		</ChartGrid>
	);
}

export default External;
