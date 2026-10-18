import { TableHead } from 'components/ui/table';
import { cn } from 'lib/utils';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Order, OrderBy } from 'types/api/errors/getAll';

import ColumnSearchFilter from './ColumnSearchFilter';
import { ColumnFilterKey, ExceptionColumn } from './types';

interface ExceptionsHeadCellProps {
	column: ExceptionColumn;
	order: Order;
	orderParam: OrderBy;
	filterValues: Record<ColumnFilterKey, string>;
	onSort: (column: OrderBy) => void;
	onFilter: (filterKey: ColumnFilterKey, value: string) => void;
}

function ExceptionsHeadCell({
	column,
	order,
	orderParam,
	filterValues,
	onSort,
	onFilter,
}: ExceptionsHeadCellProps): JSX.Element {
	const active = column.sortable && column.key === orderParam;
	let ariaSort: 'ascending' | 'descending' | 'none' | undefined;
	if (column.sortable) {
		ariaSort = active ? order : 'none';
	}

	let Icon = ChevronsUpDown;
	if (active) {
		Icon = order === 'ascending' ? ArrowUp : ArrowDown;
	}

	const { filter, key } = column;

	return (
		<TableHead
			aria-sort={ariaSort}
			className={cn(column.align === 'right' && 'tw:text-right', column.className)}
		>
			<span
				className={cn(
					'tw:inline-flex tw:items-center tw:gap-1 tw:align-middle',
					column.align === 'right' && 'tw:flex-row-reverse',
				)}
			>
				{column.sortable && key !== 'exceptionMessage' ? (
					<button
						type="button"
						data-testid={`exceptions-sort-${key}`}
						onClick={(): void => onSort(key)}
						className={cn(
							'tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:p-0 tw:tracking-[inherit] tw:text-muted-foreground! tw:uppercase tw:hover:text-foreground! tw:focus-visible:outline-2 tw:focus-visible:outline-ring',
							column.align === 'right' && 'tw:flex-row-reverse',
							active && 'tw:text-foreground!',
						)}
					>
						{column.label}
						<Icon aria-hidden="true" className="tw:size-3.5 tw:flex-none" />
					</button>
				) : (
					column.label
				)}
				{filter && (
					<ColumnSearchFilter
						label={column.label}
						placeholder={filter.placeholder}
						value={filterValues[filter.key]}
						onSearch={(value): void => onFilter(filter.key, value)}
						testId={`exceptions-filter-${filter.key}`}
					/>
				)}
			</span>
		</TableHead>
	);
}

export default ExceptionsHeadCell;
