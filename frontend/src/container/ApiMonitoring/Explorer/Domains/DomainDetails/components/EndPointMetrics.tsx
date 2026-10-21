import { useMemo } from 'react';
import { UseQueryResult } from 'react-query';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import { Skeleton } from 'components/ui/skeleton';
import { errorRateTone, formatMs } from 'container/ApiMonitoring/domainList';
import { getFormattedEndPointMetricsData } from 'container/ApiMonitoring/utils';
import { formatPercent } from 'lib/apm/format';
import { cn } from 'lib/utils';
import { SuccessResponse } from 'types/api';

import ErrorState from './ErrorState';
import KpiCell from './KpiCell';

interface EndPointMetricsProps {
	endPointMetricsDataQuery: UseQueryResult<SuccessResponse<any>, unknown>;
	/** The selected endpoint; the KPIs then cover only it. */
	endpointName?: string;
	/** Endpoints of the domain, shown while none is selected. */
	endpointCount?: number;
}

const toNumber = (value: number | string | undefined): number | undefined => {
	if (value === undefined || value === '-' || value === '') {
		return undefined;
	}
	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
};

/** Rate, p99, error rate and last use of the domain, or of the selected endpoint. */
function EndPointMetrics({
	endPointMetricsDataQuery,
	endpointName,
	endpointCount,
}: EndPointMetricsProps): JSX.Element {
	const { isLoading, isRefetching, isError, data, refetch } =
		endPointMetricsDataQuery;
	const loading = isLoading || isRefetching;

	const metrics = useMemo(() => {
		if (loading || isError) {
			return null;
		}
		return getFormattedEndPointMetricsData(
			data?.payload?.data?.result[0]?.table?.rows,
		);
	}, [data?.payload?.data?.result, loading, isError]);

	if (isError) {
		return <ErrorState refetch={refetch} />;
	}

	const value = (content: string, unit?: string): JSX.Element =>
		loading ? (
			<Skeleton className="tw:mt-1 tw:h-6 tw:w-20 tw:bg-muted" />
		) : (
			<>
				{content}
				{unit && content !== '—' && (
					<span className="tw:ml-1 tw:text-[13px] tw:font-normal tw:tracking-normal tw:text-muted-foreground">
						{unit}
					</span>
				)}
			</>
		);

	const rate = toNumber(metrics?.rate);
	const errorRate = toNumber(metrics?.errorRate);
	const lastUsed = metrics?.lastUsed;
	const lastUsedText =
		lastUsed && lastUsed !== '-' ? lastUsed.replace(/\s*ago$/, '') : '—';

	return (
		<KpiStrip label="Endpoint metrics" testId="endpoint-metrics">
			<KpiCell
				label={endpointName ? 'Endpoint' : 'Endpoints'}
				testId="endpoint-kpi-scope"
				mono={Boolean(endpointName)}
			>
				{endpointName ??
					(endpointCount === undefined ? '—' : String(endpointCount))}
			</KpiCell>
			<KpiCell label="Rate" testId="endpoint-kpi-rate">
				{value(rate === undefined ? '—' : rate.toFixed(rate < 10 ? 2 : 1), 'ops/s')}
			</KpiCell>
			<KpiCell label="p99 latency" testId="endpoint-kpi-p99">
				{value(formatMs(toNumber(metrics?.latency)))}
			</KpiCell>
			<KpiCell
				label="Error rate"
				testId="endpoint-kpi-error-rate"
				className={cn(
					errorRate !== undefined &&
						errorRateTone(errorRate) === 'error' &&
						'tw:text-error-ink',
				)}
			>
				{value(formatPercent(errorRate))}
			</KpiCell>
			<KpiCell label="Last used" testId="endpoint-kpi-last-used">
				{value(lastUsedText, 'ago')}
			</KpiCell>
		</KpiStrip>
	);
}

EndPointMetrics.defaultProps = {
	endpointName: undefined,
	endpointCount: undefined,
};

export default EndPointMetrics;
