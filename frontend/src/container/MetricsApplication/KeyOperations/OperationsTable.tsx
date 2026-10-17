import ImpactBar from 'components/PageTemplate/components/ImpactBar';
import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
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
import { errorRateTone } from 'pages/Services/components/ServicesList/utils';
import { isModifierKeyPressed } from 'utils/app';

import { OperationRow, OperationSortKey } from './useTopOperationsTable';

interface OperationsTableProps {
	rows: OperationRow[];
	loading: boolean;
	sort: SortState<OperationSortKey> | null;
	onSort: (key: OperationSortKey) => void;
	onOpen: (operation: string, openInNewTab: boolean) => void;
}

const COLUMNS: { key: OperationSortKey; label: string }[] = [
	{ key: 'p50', label: 'P50 (in ms)' },
	{ key: 'p95', label: 'P95 (in ms)' },
	{ key: 'p99', label: 'P99 (in ms)' },
	{ key: 'numCalls', label: 'Number of Calls' },
	{ key: 'errorRate', label: 'Error Rate' },
];

const SKELETON_ROWS = ['a', 'b', 'c', 'd'];

function nsToMs(value: number): string {
	return (value / 1_000_000).toFixed(2);
}

function OperationsTable({
	rows,
	loading,
	sort,
	onSort,
	onOpen,
}: OperationsTableProps): JSX.Element {
	return (
		<Table className="tw:min-w-[760px] tw:table-fixed">
			<TableHeader>
				<TableRow>
					<TableHead className="tw:w-[34%]">Name</TableHead>
					{COLUMNS.map((column) => (
						<SortableTableHead
							key={column.key}
							label={column.label}
							align={column.key === 'numCalls' ? 'left' : 'right'}
							active={sort?.key === column.key}
							direction={sort?.direction ?? 'desc'}
							onSort={(): void => onSort(column.key)}
							testId={`top-operations-sort-${column.key}`}
							className={column.key === 'numCalls' ? 'tw:w-[18%]' : undefined}
						/>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading &&
					SKELETON_ROWS.map((row) => (
						<TableRow key={row}>
							<TableCell colSpan={COLUMNS.length + 1}>
								<Skeleton className="tw:h-5 tw:bg-muted" />
							</TableCell>
						</TableRow>
					))}
				{!loading &&
					rows.map((row) => (
						<TableRow
							key={row.name}
							data-testid="top-operation-row"
							className="tw:cursor-pointer"
							onClick={(event): void => onOpen(row.name, isModifierKeyPressed(event))}
						>
							<TableCell>
								<button
									type="button"
									title={row.name}
									className="tw:block tw:max-w-full tw:cursor-pointer tw:truncate tw:font-mono tw:text-xs tw:text-primary! tw:hover:text-primary-strong! tw:hover:underline"
								>
									{row.name}
								</button>
							</TableCell>
							<TableCell className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
								{nsToMs(row.p50)}
							</TableCell>
							<TableCell className="tw:text-right tw:tabular-nums">
								{nsToMs(row.p95)}
							</TableCell>
							<TableCell className="tw:text-right tw:tabular-nums">
								{nsToMs(row.p99)}
							</TableCell>
							<TableCell>
								<span className="tw:flex tw:items-center tw:gap-2">
									<span className="tw:min-w-12 tw:text-right tw:tabular-nums">
										{row.numCalls}
									</span>
									<ImpactBar
										value={row.callShare}
										label={`${row.callShare.toFixed(0)}% of calls`}
									/>
								</span>
							</TableCell>
							<TableCell className="tw:text-right">
								<StatusBadge tone={errorRateTone(row.errorRate)}>
									{`${row.errorRate.toFixed(2)} %`}
								</StatusBadge>
							</TableCell>
						</TableRow>
					))}
			</TableBody>
		</Table>
	);
}

export default OperationsTable;
