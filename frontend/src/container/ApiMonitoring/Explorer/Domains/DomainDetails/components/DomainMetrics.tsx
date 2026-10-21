import { Fragment, useMemo } from 'react';
import { useQueries } from 'react-query';
import { Link } from 'react-router-dom';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Skeleton } from 'components/ui/skeleton';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import ROUTES from 'constants/routes';
import { errorRateTone, formatMs } from 'container/ApiMonitoring/domainList';
import {
	DomainMetricsResponseRow,
	formatDomainMetricsDataForTable,
	getDomainMetricsQueryPayload,
} from 'container/ApiMonitoring/utils';
import { formatCount, formatPercent } from 'lib/apm/format';
import { GetMetricQueryRange } from 'lib/dashboard/getQueryResults';
import { SuccessResponse } from 'types/api';
import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';

import ErrorState from './ErrorState';

interface DomainMetricsProps {
	domainName: string;
	timeRange: { startTime: number; endTime: number };
	domainListFilters: IBuilderQuery['filters'];
	/** Services whose client spans call the domain, busiest first. */
	callers?: string[];
}

const toNumber = (value: number | string): number | undefined =>
	value === '-' || value === '' ? undefined : Number(value);

const Separator = (): JSX.Element => (
	<span aria-hidden="true" className="tw:text-subtle-foreground">
		—
	</span>
);

/** The domain's own numbers for the page header: errors, callers, calls, p99, last call. */
function DomainMetrics({
	domainName,
	timeRange,
	domainListFilters,
	callers = [],
}: DomainMetricsProps): JSX.Element {
	const { startTime: minTime, endTime: maxTime } = timeRange;

	const queryPayloads = useMemo(
		() =>
			getDomainMetricsQueryPayload(
				domainName,
				minTime,
				maxTime,
				domainListFilters,
			),
		[domainName, minTime, maxTime, domainListFilters],
	);

	const [domainMetricsDataQuery] = useQueries(
		queryPayloads.map((payload) => ({
			queryKey: [
				REACT_QUERY_KEY.GET_DOMAIN_METRICS_DATA,
				payload,
				ENTITY_VERSION_V5,
			],
			queryFn: (): Promise<SuccessResponse<MetricRangePayloadProps>> =>
				GetMetricQueryRange(payload, ENTITY_VERSION_V5),
			enabled: !!payload,
			staleTime: 60 * 1000,
		})),
	);

	const { data, isLoading, isRefetching, isError, refetch } =
		domainMetricsDataQuery;

	const metrics = useMemo(() => {
		const rowData = data?.payload?.data?.result[0]?.table?.rows[0];
		return formatDomainMetricsDataForTable(
			rowData as DomainMetricsResponseRow | undefined,
		);
	}, [data]);

	if (isError) {
		return <ErrorState refetch={refetch} compact />;
	}

	if (isLoading || isRefetching) {
		return <Skeleton className="tw:inline-block tw:h-4 tw:w-72 tw:bg-muted" />;
	}

	const errorRate = toNumber(metrics.errorRate);

	return (
		<span
			data-testid="domain-summary"
			className="tw:inline-flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1"
		>
			{errorRate !== undefined && (
				<StatusBadge tone={errorRateTone(errorRate)} testId="domain-summary-errors">
					{formatPercent(errorRate)} errors
				</StatusBadge>
			)}
			{callers.length > 0 && (
				<span>
					called by{' '}
					{callers.map((service, index) => (
						<Fragment key={service}>
							{index > 0 && ', '}
							<Link
								to={ROUTES.SERVICE_METRICS.replace(
									':servicename',
									encodeURIComponent(service),
								)}
								className="tw:font-mono tw:text-[13px] tw:text-primary!"
							>
								{service}
							</Link>
						</Fragment>
					))}
				</span>
			)}
			<Separator />
			<span data-testid="domain-summary-calls">
				<span className="tw:text-foreground">
					{formatCount(toNumber(metrics.endpointCount))}
				</span>{' '}
				calls
			</span>
			<Separator />
			<span data-testid="domain-summary-p99">
				p99{' '}
				<span className="tw:text-foreground">
					{formatMs(toNumber(metrics.latency))}
				</span>
			</span>
			{metrics.lastUsed !== '-' && (
				<>
					<Separator />
					<span>last call {metrics.lastUsed}</span>
				</>
			)}
		</span>
	);
}

export default DomainMetrics;
