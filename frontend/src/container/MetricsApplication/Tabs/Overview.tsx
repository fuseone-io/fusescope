import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useParams } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import getTopLevelOperations, {
	ServiceDataProps,
} from 'api/metrics/getTopLevelOperations';
import Panel from 'components/PageTemplate/components/Panel';
import { FeatureKeys } from 'constants/features';
import { QueryParams } from 'constants/query';
import { PANEL_TYPES } from 'constants/queryBuilder';
import useResourceAttribute from 'hooks/useResourceAttribute';
import {
	getResourceDeploymentKeys,
	resourceAttributesToTagFilterItems,
} from 'hooks/useResourceAttribute/utils';
import useUrlQuery from 'hooks/useUrlQuery';
import history from 'lib/history';
import { defaultTo } from 'lodash-es';
import { useAppContext } from 'providers/App/App';
import { UpdateTimeInterval } from 'store/actions';
import { AppState } from 'store/reducers';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { EQueryType } from 'types/common/dashboard';
import { GlobalReducer } from 'types/reducer/globalTime';
import { v4 as uuid } from 'uuid';

import { GraphTitle, SERVICE_CHART_ID } from '../constant';
import { getWidgetQueryBuilder } from '../MetricsApplication.factory';
import {
	errorPercentage,
	operationPerSec,
} from '../MetricsPageQueries/OverviewQueries';
import ChartCell from '../components/ChartCell';
import ChartGrid from '../components/ChartGrid';
import { useServiceChartMenu } from '../hooks/useServiceChartMenu';
import ApDex from './Overview/ApDex';
import ServiceKpis from './Overview/ServiceKpis';
import ServiceOverview from './Overview/ServiceOverview';
import TopLevelOperation from './Overview/TopLevelOperations';
import TopOperation from './Overview/TopOperation';
import TopOperationMetrics from './Overview/TopOperationMetrics';
import { IServiceName } from './types';
import {
	handleNonInQueryRange,
	useGetAPMToLogsQueries,
	useGetAPMToTracesQueries,
} from './util';

function Application(): JSX.Element {
	const { servicename: encodedServiceName } = useParams<IServiceName>();
	const servicename = decodeURIComponent(encodedServiceName);

	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const { pathname } = useLocation();
	const { queries } = useResourceAttribute();
	const urlQuery = useUrlQuery();

	const { featureFlags } = useAppContext();
	const isSpanMetricEnabled =
		featureFlags?.find((flag) => flag.name === FeatureKeys.USE_SPAN_METRICS)
			?.active || false;

	const dispatch = useDispatch();

	const logEventCalledRef = useRef(false);
	useEffect(() => {
		if (!logEventCalledRef.current) {
			const selectedEnvironments = queries.find(
				(val) => val.tagKey === getResourceDeploymentKeys(),
			)?.tagValue;

			logEvent('APM: Service detail page visited', {
				selectedEnvironments,
				resourceAttributeUsed: !!queries?.length,
				section: 'overview',
			});
			logEventCalledRef.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const {
		data: topLevelOperations,
		error: topLevelOperationsError,
		isLoading: topLevelOperationsIsLoading,
		isError: topLevelOperationsIsError,
	} = useQuery<ServiceDataProps>({
		queryKey: [servicename, minTime, maxTime],
		queryFn: (): Promise<ServiceDataProps> =>
			getTopLevelOperations({
				service: servicename || '',
				start: minTime,
				end: maxTime,
			}),
		// the time range is part of the key, so without this every window change blanks the
		// operations list and the widgets below are rebuilt with an empty `operation in []`
		keepPreviousData: true,
	});

	const apmToTraceQuery = useGetAPMToTracesQueries({ servicename });
	const apmToLogsQuery = useGetAPMToLogsQueries({ servicename });

	const tagFilterItems = useMemo(
		() =>
			handleNonInQueryRange(resourceAttributesToTagFilterItems(queries)) || [],
		[queries],
	);

	const topLevelOperationsRoute = useMemo(
		() =>
			topLevelOperations
				? defaultTo(topLevelOperations[servicename || ''], [])
				: [],
		[servicename, topLevelOperations],
	);

	const operationPerSecWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: operationPerSec({
						servicename,
						tagFilterItems,
						topLevelOperations: topLevelOperationsRoute,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.RATE_PER_OPS,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: 'ops',
				id: SERVICE_CHART_ID.rps,
			}),
		[servicename, tagFilterItems, topLevelOperationsRoute],
	);

	const errorPercentageWidget = useMemo(
		() =>
			getWidgetQueryBuilder({
				query: {
					queryType: EQueryType.QUERY_BUILDER,
					promql: [],
					builder: errorPercentage({
						servicename,
						tagFilterItems,
						topLevelOperations: topLevelOperationsRoute,
					}),
					clickhouse_sql: [],
					id: uuid(),
				},
				title: GraphTitle.ERROR_PERCENTAGE,
				panelTypes: PANEL_TYPES.TIME_SERIES,
				yAxisUnit: '%',
				id: SERVICE_CHART_ID.errorPercentage,
				fillSpans: true,
			}),
		[servicename, tagFilterItems, topLevelOperationsRoute],
	);

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

	const logErrorQuery = useGetAPMToLogsQueries({
		servicename,
		filters: [
			{
				id: uuid().slice(0, 8),
				key: {
					key: 'severity_text',
					dataType: DataTypes.String,
					type: '',
					id: 'severity_text--string----true',
				},
				op: 'in',
				value: ['ERROR', 'FATAL', 'error', 'fatal'],
			},
		],
	});
	const errorTrackQuery = useGetAPMToTracesQueries({
		servicename,
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
	const menuFor = useServiceChartMenu(servicename);
	const serviceMenu = useMemo(
		() => menuFor({ tracesQuery: apmToTraceQuery, logsQuery: apmToLogsQuery }),
		[menuFor, apmToTraceQuery, apmToLogsQuery],
	);
	const errorMenu = useMemo(
		() => menuFor({ tracesQuery: errorTrackQuery, logsQuery: logErrorQuery }),
		[menuFor, errorTrackQuery, logErrorQuery],
	);

	return (
		<div className="tw:flex tw:flex-col tw:gap-4">
			<ServiceKpis servicename={servicename} />
			<ChartGrid>
				<ChartCell>
					<ServiceOverview
						onDragSelect={onDragSelect}
						pointMenu={serviceMenu}
						topLevelOperationsRoute={topLevelOperationsRoute}
						topLevelOperationsIsLoading={topLevelOperationsIsLoading}
					/>
				</ChartCell>

				<ChartCell>
					<TopLevelOperation
						pointMenu={serviceMenu}
						onDragSelect={onDragSelect}
						topLevelOperationsError={topLevelOperationsError}
						topLevelOperationsIsError={topLevelOperationsIsError}
						name="operations_per_sec"
						widget={operationPerSecWidget}
						topLevelOperationsIsLoading={topLevelOperationsIsLoading}
					/>
				</ChartCell>

				<ChartCell>
					<ApDex
						pointMenu={serviceMenu}
						onDragSelect={onDragSelect}
						topLevelOperationsRoute={topLevelOperationsRoute}
						tagFilterItems={tagFilterItems}
					/>
				</ChartCell>

				<ChartCell>
					<TopLevelOperation
						pointMenu={errorMenu}
						onDragSelect={onDragSelect}
						topLevelOperationsError={topLevelOperationsError}
						topLevelOperationsIsError={topLevelOperationsIsError}
						name="error_percentage_%"
						widget={errorPercentageWidget}
						topLevelOperationsIsLoading={topLevelOperationsIsLoading}
					/>
				</ChartCell>
			</ChartGrid>

			{isSpanMetricEnabled ? (
				<Panel testId="top-operations" className="tw:overflow-hidden">
					<TopOperationMetrics />
				</Panel>
			) : (
				<TopOperation />
			)}
		</div>
	);
}

export type ClickHandlerType = () => void;

export default Application;
