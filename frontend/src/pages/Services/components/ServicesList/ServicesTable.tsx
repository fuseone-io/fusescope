import { useLocation } from 'react-router-dom';
import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import TrendCell from 'components/PageTemplate/components/TrendCell';
import { SortState } from 'components/PageTemplate/types';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import {
	formatCount,
	formatLatencyMs,
	formatPercent,
	formatRate,
} from 'lib/apm/format';
import { useServiceKinds } from 'lib/apm/useServiceKinds';
import { cn } from 'lib/utils';
import { isModifierKeyPressed } from 'utils/app';

import {
	ColumnKey,
	ColumnTitle,
	ERROR_RATE_CRITICAL,
	ServiceSortKey,
} from './constants';
import { errorRateDelta, p99Delta, rateDelta } from './serviceCells';
import ServiceNameCell from './ServiceNameCell';
import { ServiceRow } from './serviceRows';
import ServiceTracesLink from './ServiceTracesLink';
import { serviceUrl } from './utils';

interface ServicesTableProps {
	loading: boolean;
	rows: ServiceRow[];
	sort: SortState<ServiceSortKey>;
	onSort: (key: ColumnKey) => void;
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'];
const COLUMN_COUNT = 8;
const PLAIN_HEAD = 'tw:text-right';

function ServicesTable({
	loading,
	rows,
	sort,
	onSort,
}: ServicesTableProps): JSX.Element {
	const { search } = useLocation();
	const { safeNavigate } = useSafeNavigate();
	const identify = useServiceKinds();

	const sortable = (key: ColumnKey, align: 'left' | 'right'): JSX.Element => (
		<SortableTableHead
			label={ColumnTitle[key]}
			align={align}
			active={sort.key === key}
			direction={sort.direction}
			onSort={(): void => onSort(key)}
			testId={`services-sort-${key}`}
			className={key === ColumnKey.Application ? 'tw:w-[30%]' : undefined}
		/>
	);

	return (
		<Table className="tw:min-w-[1080px]">
			<TableHeader>
				<TableRow>
					{sortable(ColumnKey.Application, 'left')}
					{sortable(ColumnKey.Operations, 'right')}
					{sortable(ColumnKey.ErrorRate, 'right')}
					<TableHead className={PLAIN_HEAD}>p50</TableHead>
					<TableHead className={PLAIN_HEAD}>p95</TableHead>
					{sortable(ColumnKey.P99, 'right')}
					{sortable(ColumnKey.Requests, 'right')}
					<TableHead className="tw:w-12">
						<span className="tw:sr-only">Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading &&
					SKELETON_ROWS.map((row) => (
						<TableRow key={row} data-testid="service-row-loading">
							<TableCell colSpan={COLUMN_COUNT}>
								<Skeleton className="tw:h-5 tw:bg-muted" />
							</TableCell>
						</TableRow>
					))}
				{!loading &&
					rows.map((row) => {
						const href = serviceUrl(row.serviceName, search);
						const severe = row.errorRate >= ERROR_RATE_CRITICAL;
						return (
							<TableRow
								key={row.serviceName}
								data-testid="service-row"
								className="tw:group tw:cursor-pointer"
								onClick={(event): void =>
									safeNavigate(href, { newTab: isModifierKeyPressed(event) })
								}
							>
								<TableCell className="tw:max-w-0">
									<ServiceNameCell
										service={row.service}
										badges={row.badges}
										identity={identify(row.serviceName)}
										href={href}
									/>
								</TableCell>
								<TableCell>
									<TrendCell
										value={formatRate(row.callRate)}
										values={row.apm?.sparks.rate}
										delta={rateDelta(row)}
									/>
								</TableCell>
								<TableCell data-testid="service-error-rate">
									<TrendCell
										value={formatPercent(row.errorRate)}
										values={row.apm?.sparks.errorRate}
										strokeClassName={
											severe ? 'tw:stroke-error' : 'tw:stroke-subtle-foreground'
										}
										valueClassName={cn(severe && 'tw:font-semibold tw:text-error-ink')}
										delta={errorRateDelta(row)}
									/>
								</TableCell>
								<TableCell className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
									{formatLatencyMs(row.apm?.current.p50)}
								</TableCell>
								<TableCell className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
									{formatLatencyMs(row.apm?.current.p95)}
								</TableCell>
								<TableCell data-testid="service-p99">
									<TrendCell
										value={formatLatencyMs(row.p99)}
										values={row.apm?.sparks.p99}
										strokeClassName="tw:stroke-series-2"
										delta={p99Delta(row)}
									/>
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{formatCount(row.numCalls)}
								</TableCell>
								<TableCell className="tw:text-right">
									<ServiceTracesLink servicename={row.serviceName} />
								</TableCell>
							</TableRow>
						);
					})}
			</TableBody>
		</Table>
	);
}

export default ServicesTable;
