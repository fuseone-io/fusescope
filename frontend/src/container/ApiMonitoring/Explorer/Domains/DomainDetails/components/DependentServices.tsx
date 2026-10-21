import { useMemo, useState } from 'react';
import { UseQueryResult } from 'react-query';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { QueryParams } from 'constants/query';
import { formatMs } from 'container/ApiMonitoring/domainList';
import {
	DependentServicesData,
	getFormattedDependentServicesData,
} from 'container/ApiMonitoring/utils';
import { formatCount } from 'lib/apm/format';
import { ChevronsUpDown } from 'lucide-react';
import { SuccessResponse } from 'types/api';
import { openInNewTab } from 'utils/navigation';

import ErrorRateBar from '../../../../components/ErrorRateBar';
import ErrorState from './ErrorState';

interface DependentServicesProps {
	dependentServicesQuery: UseQueryResult<SuccessResponse<any>, unknown>;
	timeRange: {
		startTime: number;
		endTime: number;
	};
}

const COLLAPSED_ROWS = 5;
const SKELETON_ROWS = ['a', 'b'];
const NUMBER = 'tw:text-right tw:tabular-nums';

const toNumber = (value: number | string): number | undefined =>
	value === '-' || value === 'n/a' || value === '' ? undefined : Number(value);

function formatRate(value: number | string): string {
	const rate = toNumber(value);
	return rate === undefined ? '—' : rate.toFixed(rate < 10 ? 2 : 1);
}

function DependentServices({
	dependentServicesQuery,
	timeRange,
}: DependentServicesProps): JSX.Element {
	const { data, refetch, isError, isLoading, isRefetching } =
		dependentServicesQuery;
	const [isExpanded, setIsExpanded] = useState<boolean>(false);

	const dependentServicesData = useMemo(
		(): DependentServicesData[] =>
			getFormattedDependentServicesData(
				data?.payload?.data?.result[0]?.table?.rows,
			),
		[data],
	);

	if (isError) {
		return <ErrorState refetch={refetch} />;
	}

	const loading = isLoading || isRefetching;
	const rows = isExpanded
		? dependentServicesData
		: dependentServicesData.slice(0, COLLAPSED_ROWS);

	const openService = (record: DependentServicesData): void => {
		const serviceName =
			record.serviceData.serviceName && record.serviceData.serviceName !== '-'
				? record.serviceData.serviceName
				: '';
		const urlQuery = new URLSearchParams();
		urlQuery.set(QueryParams.startTime, timeRange.startTime.toString());
		urlQuery.set(QueryParams.endTime, timeRange.endTime.toString());
		openInNewTab(`/services/${serviceName}?${urlQuery.toString()}`);
	};

	return (
		<ContentPanel
			testId="dependent-services"
			title="Dependent services"
			subtitle="Services whose client spans call this domain. Select one to open it."
			divided
			footer={
				dependentServicesData.length > COLLAPSED_ROWS ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={(): void => setIsExpanded((prev) => !prev)}
					>
						<ChevronsUpDown aria-hidden="true" />
						{isExpanded ? 'Show less' : 'Show more'}
					</Button>
				) : undefined
			}
		>
			<Table aria-label="Dependent services" className="tw:min-w-[640px]">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead className="tw:w-[40%]">Service</TableHead>
						<TableHead className="tw:text-right">p99 latency</TableHead>
						<TableHead className="tw:w-[24%]">Error %</TableHead>
						<TableHead className="tw:text-right">Rate</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{loading &&
						SKELETON_ROWS.map((key) => (
							<TableRow key={key} data-testid="dependent-service-row-loading">
								<TableCell colSpan={4}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						))}
					{!loading && dependentServicesData.length === 0 && (
						<TableRow className="tw:hover:bg-transparent">
							<TableCell
								colSpan={4}
								className="tw:h-24 tw:text-center tw:text-[13px] tw:text-muted-foreground"
							>
								This query had no results. Edit your query and try again!
							</TableCell>
						</TableRow>
					)}
					{!loading &&
						rows.map((record) => {
							const share = toNumber(record.serviceData.percentage) ?? 0;
							return (
								<TableRow
									key={record.key}
									data-testid="dependent-service-row"
									className="tw:h-14 tw:cursor-pointer"
									onClick={(): void => openService(record)}
								>
									<TableCell className="tw:max-w-0">
										<span className="tw:flex tw:flex-col tw:gap-1">
											<span className="tw:flex tw:justify-between tw:gap-2">
												<span className="tw:truncate tw:font-mono tw:font-medium">
													{record.serviceData.serviceName}
												</span>
												<span className="tw:flex-none tw:text-xs tw:text-subtle-foreground tw:tabular-nums">
													{formatCount(toNumber(record.serviceData.count))} calls · {share}%
												</span>
											</span>
											<span
												aria-hidden="true"
												className="tw:block tw:h-1.5 tw:overflow-hidden tw:rounded-full tw:bg-muted"
											>
												<span
													className="tw:block tw:h-full tw:rounded-full tw:bg-primary"
													style={{ width: `${Math.min(100, share)}%` }}
												/>
											</span>
										</span>
									</TableCell>
									<TableCell className={NUMBER}>
										{formatMs(toNumber(record.latency))}
									</TableCell>
									<TableCell>
										<ErrorRateBar value={toNumber(record.errorPercentage)} />
									</TableCell>
									<TableCell className={NUMBER}>
										{formatRate(record.rate)}
										{record.rate !== '-' && (
											<span className="tw:ml-1 tw:text-subtle-foreground">ops/s</span>
										)}
									</TableCell>
								</TableRow>
							);
						})}
				</TableBody>
			</Table>
		</ContentPanel>
	);
}

export default DependentServices;
