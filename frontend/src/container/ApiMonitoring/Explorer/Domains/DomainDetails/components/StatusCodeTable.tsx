import { useMemo } from 'react';
import { UseQueryResult } from 'react-query';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import {
	statusRangeColors,
	statusRangeOf,
} from 'container/ApiMonitoring/statusRanges';
import { getFormattedEndPointStatusCodeData } from 'container/ApiMonitoring/utils';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { formatMs } from 'container/ApiMonitoring/domainList';
import { formatCount } from 'lib/apm/format';
import { SuccessResponse } from 'types/api';

import ErrorState from './ErrorState';

const SKELETON_ROWS = ['a', 'b'];
const NUMBER = 'tw:text-right tw:tabular-nums';

const toNumber = (value: number | string): number | undefined =>
	value === '-' || value === 'n/a' ? undefined : Number(value);

function formatRate(value: number | string): string {
	const rate = toNumber(value);
	return rate === undefined ? '—' : rate.toFixed(rate < 10 ? 2 : 1);
}

function StatusCodeTable({
	endPointStatusCodeDataQuery,
}: {
	endPointStatusCodeDataQuery: UseQueryResult<SuccessResponse<any>, unknown>;
}): JSX.Element {
	const { isLoading, isRefetching, isError, data, refetch } =
		endPointStatusCodeDataQuery;
	const loading = isLoading || isRefetching;
	const colors = statusRangeColors(useIsDarkMode());

	const statusCodeData = useMemo(() => {
		if (loading || isError) {
			return [];
		}
		return getFormattedEndPointStatusCodeData(
			data?.payload?.data?.result[0]?.table?.rows,
		);
	}, [data?.payload?.data?.result, loading, isError]);

	if (isError) {
		return <ErrorState refetch={refetch} />;
	}

	return (
		<ContentPanel
			title="Status codes"
			subtitle="Calls, rate and p99 latency for each response code."
			divided
			testId="status-code-table"
		>
			<Table aria-label="Status codes">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead>Status code</TableHead>
						<TableHead className="tw:text-right">Calls</TableHead>
						<TableHead className="tw:text-right">Rate</TableHead>
						<TableHead className="tw:text-right">p99</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{loading &&
						SKELETON_ROWS.map((key) => (
							<TableRow key={key} data-testid="status-code-row-loading">
								<TableCell colSpan={4}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						))}
					{!loading && statusCodeData.length === 0 && (
						<TableRow className="tw:hover:bg-transparent">
							<TableCell
								colSpan={4}
								data-testid="status-code-table-empty"
								className="tw:h-24 tw:text-center tw:text-[13px] tw:text-muted-foreground"
							>
								This query had no results. Edit your query and try again!
							</TableCell>
						</TableRow>
					)}
					{!loading &&
						statusCodeData.map((row) => (
							<TableRow key={row.key} data-testid="status-code-row">
								<TableCell>
									<span className="tw:flex tw:items-center tw:gap-2">
										<span
											aria-hidden="true"
											className="tw:size-2 tw:flex-none tw:rounded-[2px]"
											style={{ background: colors[statusRangeOf(row.statusCode)] }}
										/>
										<span className="tw:font-mono tw:font-medium">{row.statusCode}</span>
									</span>
								</TableCell>
								<TableCell className={NUMBER}>
									{formatCount(toNumber(row.count))}
								</TableCell>
								<TableCell className={NUMBER}>
									{formatRate(row.rate)}
									{row.rate !== '-' && (
										<span className="tw:ml-1 tw:text-subtle-foreground">ops/s</span>
									)}
								</TableCell>
								<TableCell className={NUMBER}>
									{formatMs(toNumber(row.p99Latency))}
								</TableCell>
							</TableRow>
						))}
				</TableBody>
			</Table>
		</ContentPanel>
	);
}

export default StatusCodeTable;
