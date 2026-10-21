import { useCallback, useMemo } from 'react';
import { useQueries } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import logEvent from 'api/common/logEvent';
import { useNavigateToExplorer } from 'components/CeleryTask/useNavigateToExplorer';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { Button } from 'components/ui/button';
import { ENTITY_VERSION_V4 } from 'constants/app';
import { PANEL_TYPES } from 'constants/queryBuilder';
import { GetMetricQueryRange } from 'lib/dashboard/getQueryResults';
import { AppState } from 'store/reducers';
import { SuccessResponse } from 'types/api';
import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';
import { GlobalReducer } from 'types/reducer/globalTime';
import { v4 as uuidv4 } from 'uuid';

import {
	celeryOverviewAvgLatencyWidgetData,
	celeryOverviewErrorRateWidgetData,
	celeryOverviewRequestRateWidgetData,
} from '../CeleryOverviewGraphUtils';
import { getQueryPayloadFromWidgetsData } from '../CeleryOverviewUtils';

const ERROR_RATE_ALERT = 5;

const HAS_ERROR_FILTER = (): TagFilterItem => ({
	id: uuidv4(),
	key: {
		dataType: DataTypes.bool,
		id: 'has_error--bool----true',
		key: 'has_error',
		type: '',
	},
	op: '=',
	value: 'true',
});

export default function ValueInfo({
	filters,
}: {
	filters?: TagFilterItem[];
}): JSX.Element {
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	// get data from api
	const queryPayloads = useMemo(
		() =>
			getQueryPayloadFromWidgetsData({
				start: Math.floor(minTime / 1000000000),
				end: Math.floor(maxTime / 1000000000),
				widgetsData: [
					celeryOverviewRequestRateWidgetData(filters),
					celeryOverviewErrorRateWidgetData(filters),
					celeryOverviewAvgLatencyWidgetData(filters),
				],
				panelType: PANEL_TYPES.VALUE,
			}),
		[minTime, maxTime, filters],
	);

	const queries = useQueries(
		queryPayloads.map((payload) => ({
			queryKey: [
				'overview-detail',
				payload,
				ENTITY_VERSION_V4,
				'overview-right-panel',
			],
			queryFn: (): Promise<SuccessResponse<MetricRangePayloadProps>> =>
				GetMetricQueryRange(payload, ENTITY_VERSION_V4),
			enabled: !!payload,
		})),
	);

	const getValues = useCallback(
		() =>
			queries.map((query) => {
				const value = parseFloat(
					query.data?.payload?.data?.newResult?.data?.result?.[0]?.series?.[0]
						?.values?.[0]?.value || 'NaN',
				);
				return Number.isNaN(value) ? 'NaN' : value.toFixed(2);
			}),
		[queries],
	);

	const isLoading = queries.some((query) => query.isLoading);
	const [requestRate, errorRate, avgLatency] = useMemo(
		() => (isLoading ? ['0', '0', '0'] : getValues()),
		[isLoading, getValues],
	);

	const navigateToExplorer = useNavigateToExplorer();

	const avgLatencyInMs = useMemo(() => {
		if (avgLatency === 'NaN') {
			return 'NaN';
		}
		const numericValue = parseFloat(avgLatency);
		return (numericValue / 1000000).toFixed(2);
	}, [avgLatency]);

	const mqAnalyticsTitle =
		'MQ Overview Page: Right drawer navigation to trace page';

	const traceLink = (
		source: string,
		extraFilters: TagFilterItem[] = [],
	): JSX.Element => (
		<Button
			variant="link"
			size="xs"
			className="tw:h-auto tw:px-0 tw:text-xs"
			disabled={isLoading}
			onClick={(): void => {
				logEvent(mqAnalyticsTitle, {
					filters,
					minTime,
					maxTime,
					source,
				});
				navigateToExplorer({
					filters: [...(filters ?? []), ...extraFilters],
					dataSource: DataSource.TRACES,
					startTime: minTime,
					endTime: maxTime,
				});
			}}
		>
			{source === 'error rate' ? 'View error traces' : 'View traces'}
		</Button>
	);

	const display = (value: string): string => (value === 'NaN' ? '0' : value);

	return (
		<KpiStrip
			label="Request rate, error rate and latency"
			testId="celery-overview-kpis"
			className="tw:grid-cols-3 tw:[&>div]:px-4 tw:[&>div]:py-3.5"
		>
			<Stat
				label="Request rate"
				value={display(requestRate)}
				unit="req/s"
				note={traceLink('request rate')}
			/>
			<Stat
				label="Error rate"
				value={
					<span
						className={
							Number(errorRate) >= ERROR_RATE_ALERT ? 'tw:text-error-ink' : undefined
						}
					>
						{display(errorRate)}
					</span>
				}
				unit="%"
				note={traceLink('error rate', [HAS_ERROR_FILTER()])}
			/>
			<Stat
				label="Avg latency"
				value={display(avgLatencyInMs)}
				unit="ms"
				note={traceLink('average latency')}
			/>
		</KpiStrip>
	);
}

ValueInfo.defaultProps = {
	filters: undefined,
};
