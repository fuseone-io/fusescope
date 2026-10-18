import { KeyboardEvent } from 'react';
import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { SA_QUERY_PARAMS } from 'container/ServiceAccountsSettings/constants';
import { ServiceAccountRow } from 'container/ServiceAccountsSettings/utils';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import IdentityCell from 'pages/Settings/components/IdentityCell';
import ListEmptyState from 'pages/Settings/components/ListEmptyState';
import LoadingRows from 'pages/Settings/components/LoadingRows';

import SAStatusBadge from './SAStatusBadge';
import {
	SASortKey,
	useServiceAccountsTableRows,
} from './useServiceAccountsTableRows';

export const PAGE_SIZE = 20;

interface ServiceAccountsTableProps {
	data: ServiceAccountRow[];
	loading: boolean;
	onRowClick?: (row: ServiceAccountRow) => void;
}

const COLUMNS: { key: SASortKey; label: string; className: string }[] = [
	{ key: 'name', label: 'Name / Email', className: 'tw:w-full' },
	{ key: 'status', label: 'Status', className: 'tw:w-[140px]' },
];

function ServiceAccountsTable({
	data,
	loading,
	onRowClick,
}: ServiceAccountsTableProps): JSX.Element {
	const [currentPage, setPage] = useQueryState(
		SA_QUERY_PARAMS.PAGE,
		parseAsInteger.withDefault(1),
	);
	const [searchQuery] = useQueryState(
		SA_QUERY_PARAMS.SEARCH,
		parseAsString.withDefault(''),
	);
	const { rows, sort, onSort } = useServiceAccountsTableRows(
		data,
		currentPage,
		PAGE_SIZE,
	);

	if (!loading && data.length === 0) {
		return (
			<ListEmptyState testId="sa-empty-state">
				{searchQuery ? (
					<>
						No results for <strong>{searchQuery}</strong>
					</>
				) : (
					'No service accounts. Start by creating one to manage keys.'
				)}
			</ListEmptyState>
		);
	}

	const onRowKeyDown = (
		event: KeyboardEvent<HTMLTableRowElement>,
		row: ServiceAccountRow,
	): void => {
		if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			onRowClick(row);
		}
	};

	return (
		<>
			<Table className="tw:min-w-[520px]" data-testid="sa-table">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						{COLUMNS.map((column) => (
							<SortableTableHead
								key={column.key}
								label={column.label}
								active={sort?.key === column.key}
								direction={sort?.direction ?? 'asc'}
								onSort={(): void => onSort(column.key)}
								testId={`sa-sort-${column.key}`}
								className={column.className}
							/>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{loading ? (
						<LoadingRows columns={COLUMNS.length} />
					) : (
						rows.map((row) => (
							<TableRow
								key={row.id}
								data-testid="sa-row"
								{...(onRowClick && {
									role: 'button',
									tabIndex: 0,
									'aria-label': `View service account ${row.name || row.email}`,
									className: 'tw:cursor-pointer',
									onClick: (): void => onRowClick(row),
									onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>): void =>
										onRowKeyDown(event, row),
								})}
							>
								<TableCell className="tw:h-[52px] tw:max-w-0">
									<IdentityCell name={row.name} email={row.email} />
								</TableCell>
								<TableCell>
									<SAStatusBadge status={row.status} />
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
			<TablePagination
				page={currentPage}
				pageSize={PAGE_SIZE}
				total={data.length}
				onPageChange={(page): void => void setPage(page)}
			/>
		</>
	);
}

export default ServiceAccountsTable;
