import { useMemo } from 'react';
import { PANEL_TYPES } from 'constants/queryBuilder';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { resourceAttributesToTagFilterItems } from 'hooks/useResourceAttribute/utils';
import { useApmSource } from 'lib/apm/useApmSource';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { EQueryType } from 'types/common/dashboard';
import { QueryBuilderData } from 'types/common/queryBuilder';
import { v4 as uuid } from 'uuid';

import ChartGrid from '../../components/ChartGrid';
import ServiceChart from '../../components/ServiceChart';
import {
	ERROR_SERIES,
	LATENCY_SERIES,
	RATE_SERIES,
} from '../../components/serviceChartSeries';
import { GraphTitle, SERVICE_CHART_ID } from '../../constant';
import { useServiceChartMenu } from '../../hooks/useServiceChartMenu';
import { useServiceTopLevelOperations } from '../../hooks/useServiceTopLevelOperations';
import { getWidgetQueryBuilder } from '../../MetricsApplication.factory';
import {
	errorPercentage,
	latency,
	operationPerSec,
} from '../../MetricsPageQueries/OverviewQueries';
import {
	handleNonInQueryRange,
	useGetAPMToLogsQueries,
	useGetAPMToTracesQueries,
	withErrorSeverity,
} from '../util';
import ApDex from './ApDex';

interface OverviewChartsProps {
	servicename: string;
	compare: boolean;
	onDragSelect: (start: number, end: number) => void;
}

const widgetOf = (
	builder: QueryBuilderData,
	title: string,
	yAxisUnit: string,
	id: string,
	fillSpans = false,
): ReturnType<typeof getWidgetQueryBuilder> =>
	getWidgetQueryBuilder({
		query: {
			queryType: EQueryType.QUERY_BUILDER,
			promql: [],
			builder,
			clickhouse_sql: [],
			id: uuid(),
		},
		title,
		panelTypes: PANEL_TYPES.TIME_SERIES,
		yAxisUnit,
		id,
		fillSpans,
	});

/** Latency, rate, error % and Apdex, two a row, each with its drilldown and alert action. */
function OverviewCharts({
	servicename,
	compare,
	onDragSelect,
}: OverviewChartsProps): JSX.Element {
	const isSpanMetricEnabled = useApmSource() === 'span-metrics';
	const { queries } = useResourceAttribute();
	const {
		operations: topLevelOperations,
		isLoading: operationsLoading,
		isError: operationsError,
	} = useServiceTopLevelOperations(servicename);

	const tagFilterItems = useMemo(
		() =>
			handleNonInQueryRange(
				resourceAttributesToTagFilterItems(queries, !isSpanMetricEnabled),
			) || [],
		[queries, isSpanMetricEnabled],
	);

	const widgets = useMemo(() => {
		const props = {
			servicename,
			tagFilterItems,
			topLevelOperations,
			isSpanMetricEnable: isSpanMetricEnabled,
		};
		return {
			latency: widgetOf(
				latency({ ...props, topLevelOperationsRoute: topLevelOperations }),
				GraphTitle.LATENCY,
				'ns',
				SERVICE_CHART_ID.latency,
			),
			rate: widgetOf(
				operationPerSec(props),
				GraphTitle.RATE_PER_OPS,
				'ops',
				SERVICE_CHART_ID.rps,
			),
			errors: widgetOf(
				errorPercentage(props),
				GraphTitle.ERROR_PERCENTAGE,
				'%',
				SERVICE_CHART_ID.errorPercentage,
				true,
			),
		};
	}, [servicename, tagFilterItems, topLevelOperations, isSpanMetricEnabled]);

	const apmToTraceQuery = useGetAPMToTracesQueries({ servicename });
	const apmToLogsQuery = useGetAPMToLogsQueries({ servicename });
	const logErrorQuery = useMemo(
		() => withErrorSeverity(apmToLogsQuery),
		[apmToLogsQuery],
	);
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

	const ready = !operationsLoading && !operationsError;
	const common = { compare, onDragSelect };

	return (
		<ChartGrid>
			<ServiceChart
				{...common}
				title="Latency"
				testId="service_latency"
				widget={widgets.latency}
				series={LATENCY_SERIES}
				pointMenu={serviceMenu}
				isQueryEnabled={ready && topLevelOperations.length > 0}
				loading={operationsLoading}
			/>
			<ServiceChart
				{...common}
				title="Rate"
				unit="req/s"
				testId="operations_per_sec"
				widget={widgets.rate}
				series={RATE_SERIES}
				pointMenu={serviceMenu}
				isQueryEnabled={ready}
				loading={operationsLoading}
			/>
			<ServiceChart
				{...common}
				title="Error %"
				unit="%"
				testId="error_percentage_%"
				widget={widgets.errors}
				series={ERROR_SERIES}
				pointMenu={errorMenu}
				isQueryEnabled={ready}
				loading={operationsLoading}
			/>
			<ApDex
				compare={compare}
				pointMenu={serviceMenu}
				onDragSelect={onDragSelect}
				topLevelOperationsRoute={topLevelOperations}
				tagFilterItems={tagFilterItems}
			/>
		</ChartGrid>
	);
}

export default OverviewCharts;
