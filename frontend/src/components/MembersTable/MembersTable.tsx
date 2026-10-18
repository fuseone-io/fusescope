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
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import IdentityCell from 'pages/Settings/components/IdentityCell';
import ListEmptyState from 'pages/Settings/components/ListEmptyState';
import LoadingRows from 'pages/Settings/components/LoadingRows';
import { useTimezone } from 'providers/Timezone';

import MemberStatusBadge from './MemberStatusBadge';
import { MemberRow, MemberSortKey } from './types';
import { useMembersTableRows } from './useMembersTableRows';

export type { MemberRow } from './types';

interface MembersTableProps {
	data: MemberRow[];
	loading: boolean;
	total: number;
	currentPage: number;
	pageSize: number;
	searchQuery: string;
	onPageChange: (page: number) => void;
	onRowClick?: (member: MemberRow) => void;
}

const COLUMNS: { key: MemberSortKey; label: string; className?: string }[] = [
	{ key: 'name', label: 'Name / Email', className: 'tw:w-full' },
	{ key: 'status', label: 'Status', className: 'tw:w-[120px]' },
	{ key: 'joinedOn', label: 'Joined On', className: 'tw:w-[220px]' },
];

function MembersTable({
	data,
	loading,
	total,
	currentPage,
	pageSize,
	searchQuery,
	onPageChange,
	onRowClick,
}: MembersTableProps): JSX.Element {
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const { rows, sort, onSort } = useMembersTableRows(
		data,
		currentPage,
		pageSize,
	);

	const formatJoinedOn = (date: string | null): string => {
		if (!date || Number.isNaN(new Date(date).getTime())) {
			return '—';
		}
		return formatTimezoneAdjustedTimestamp(date, DATE_TIME_FORMATS.DASH_DATETIME);
	};

	if (!loading && data.length === 0) {
		return (
			<ListEmptyState testId="members-empty-state">
				{searchQuery ? (
					<>
						No results for <strong>{searchQuery}</strong>
					</>
				) : (
					'No members found'
				)}
			</ListEmptyState>
		);
	}

	const onRowKeyDown = (
		event: KeyboardEvent<HTMLTableRowElement>,
		member: MemberRow,
	): void => {
		if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			onRowClick(member);
		}
	};

	return (
		<>
			<Table className="tw:min-w-[640px]" data-testid="members-table">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						{COLUMNS.map((column) => (
							<SortableTableHead
								key={column.key}
								label={column.label}
								active={sort?.key === column.key}
								direction={sort?.direction ?? 'asc'}
								onSort={(): void => onSort(column.key)}
								testId={`members-sort-${column.key}`}
								className={column.className}
							/>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{loading ? (
						<LoadingRows columns={COLUMNS.length} />
					) : (
						rows.map((member) => (
							<TableRow
								key={member.id}
								data-testid="member-row"
								tabIndex={onRowClick ? 0 : undefined}
								className={onRowClick ? 'tw:cursor-pointer' : undefined}
								onClick={(): void => onRowClick?.(member)}
								onKeyDown={(event): void => onRowKeyDown(event, member)}
							>
								<TableCell className="tw:h-[52px] tw:max-w-0">
									<IdentityCell name={member.name} email={member.email} />
								</TableCell>
								<TableCell>
									<MemberStatusBadge status={member.status} />
								</TableCell>
								<TableCell className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
									{formatJoinedOn(member.joinedOn)}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
			<TablePagination
				page={currentPage}
				pageSize={pageSize}
				total={total}
				onPageChange={onPageChange}
			/>
		</>
	);
}

export default MembersTable;
