import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import ShareBar from 'components/PageTemplate/components/ShareBar';
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
import { EndpointRow } from 'lib/apm/endpoints';
import { formatLatencyMs, formatPercent, formatRate } from 'lib/apm/format';
import { cn } from 'lib/utils';
import { isModifierKeyPressed } from 'utils/app';

import { EndpointSortKey } from './useEndpointsTable';

interface EndpointsTableProps {
	keyLabel: string;
	rows: EndpointRow[];
	loading: boolean;
	sort: SortState<EndpointSortKey>;
	onSort: (key: EndpointSortKey) => void;
	onOpen: (row: EndpointRow, openInNewTab: boolean) => void;
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd'];
const LATENCY_CELL = 'tw:text-right tw:text-muted-foreground tw:tabular-nums';

function EndpointsTable({
	keyLabel,
	rows,
	loading,
	sort,
	onSort,
	onOpen,
}: EndpointsTableProps): JSX.Element {
	const sortable = (
		key: EndpointSortKey,
		label: string,
		align: 'left' | 'right' = 'right',
		className?: string,
	): JSX.Element => (
		<SortableTableHead
			label={label}
			align={align}
			active={sort.key === key}
			direction={sort.direction}
			onSort={(): void => onSort(key)}
			testId={`top-operations-sort-${key}`}
			className={className}
		/>
	);

	return (
		<Table className="tw:min-w-[1120px] tw:table-fixed">
			<TableHeader>
				<TableRow>
					<TableHead className="tw:w-[24%]">{keyLabel}</TableHead>
					{sortable('rate', 'Rate', 'right', 'tw:w-[15%]')}
					<TableHead className="tw:text-right">Avg</TableHead>
					<TableHead className="tw:text-right">p50</TableHead>
					<TableHead className="tw:text-right">p95</TableHead>
					{sortable('p99', 'p99', 'right', 'tw:w-[15%]')}
					{sortable('errorRate', 'Error %')}
					{sortable('share', '% time spent', 'left', 'tw:w-[16%]')}
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading &&
					SKELETON_ROWS.map((row) => (
						<TableRow key={row}>
							<TableCell colSpan={8}>
								<Skeleton className="tw:h-5 tw:bg-muted" />
							</TableCell>
						</TableRow>
					))}
				{!loading && rows.length === 0 && (
					<TableRow>
						<TableCell
							colSpan={8}
							className="tw:py-10 tw:text-center tw:text-muted-foreground"
						>
							No operations match.
						</TableCell>
					</TableRow>
				)}
				{!loading &&
					rows.map((row) => (
						<TableRow
							key={row.key}
							data-testid="top-operation-row"
							className="tw:cursor-pointer"
							onClick={(event): void => onOpen(row, isModifierKeyPressed(event))}
						>
							<TableCell>
								<button
									type="button"
									title={row.name}
									aria-label={`View traces for ${row.name}`}
									className={cn(
										'tw:block tw:max-w-full tw:cursor-pointer tw:truncate tw:border-0 tw:bg-transparent tw:p-0 tw:font-mono tw:text-xs tw:hover:underline',
										row.notSet
											? 'tw:text-muted-foreground!'
											: 'tw:text-primary! tw:hover:text-primary-strong!',
									)}
								>
									{row.name}
								</button>
							</TableCell>
							<TableCell>
								<TrendCell value={formatRate(row.rate)} values={row.sparks.rate} />
							</TableCell>
							<TableCell className={LATENCY_CELL}>
								{formatLatencyMs(row.avg)}
							</TableCell>
							<TableCell className={LATENCY_CELL}>
								{formatLatencyMs(row.p50)}
							</TableCell>
							<TableCell className={LATENCY_CELL}>
								{formatLatencyMs(row.p95)}
							</TableCell>
							<TableCell>
								<TrendCell
									value={formatLatencyMs(row.p99)}
									values={row.sparks.p99}
									strokeClassName="tw:stroke-series-2"
								/>
							</TableCell>
							<TableCell
								className={cn(
									'tw:text-right tw:tabular-nums',
									row.errorRate >= 5 && 'tw:font-semibold tw:text-error-ink',
								)}
							>
								{formatPercent(row.errorRate)}
							</TableCell>
							<TableCell>
								<ShareBar value={row.share} text={`${row.share.toFixed(1)}%`} />
							</TableCell>
						</TableRow>
					))}
			</TableBody>
		</Table>
	);
}

export default EndpointsTable;
