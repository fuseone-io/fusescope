import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react';

import logEvent from 'api/common/logEvent';
import {
	DashboardtypesListOrderDTO,
	DashboardtypesListSortDTO,
} from 'api/generated/services/fuseScope.schemas';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';

import {
	type DashboardDynamicColumns,
	useDashboardsListVisibleColumnsStore,
} from '../../store/useVisibleColumnsStore';

interface Props {
	sortColumn: DashboardtypesListSortDTO;
	onSortChange: (column: DashboardtypesListSortDTO) => void;
	sortOrder: DashboardtypesListOrderDTO;
	onOrderChange: (order: DashboardtypesListOrderDTO) => void;
}

const SORT_LABELS: Record<DashboardtypesListSortDTO, string> = {
	[DashboardtypesListSortDTO.updated_at]: 'Last updated',
	[DashboardtypesListSortDTO.created_at]: 'Last created',
	[DashboardtypesListSortDTO.name]: 'Name',
};

const SORT_OPTIONS: {
	value: DashboardtypesListSortDTO;
	testId: string;
}[] = [
	{ value: DashboardtypesListSortDTO.name, testId: 'sort-by-name' },
	{
		value: DashboardtypesListSortDTO.created_at,
		testId: 'sort-by-last-created',
	},
	{
		value: DashboardtypesListSortDTO.updated_at,
		testId: 'sort-by-last-updated',
	},
];

const ORDER_OPTIONS: {
	value: DashboardtypesListOrderDTO;
	label: string;
	testId: string;
}[] = [
	{
		value: DashboardtypesListOrderDTO.asc,
		label: 'Ascending',
		testId: 'sort-order-asc',
	},
	{
		value: DashboardtypesListOrderDTO.desc,
		label: 'Descending',
		testId: 'sort-order-desc',
	},
];

// Created-at / created-by are always shown; only the "updated" columns toggle.
const METADATA_COLUMNS: {
	key: keyof DashboardDynamicColumns;
	label: string;
}[] = [
	{ key: 'updatedAt', label: 'Updated at' },
	{ key: 'updatedBy', label: 'Updated by' },
];

const TRIGGER =
	'tw:rounded-lg tw:border-input tw:bg-surface-raised tw:font-sans tw:font-normal tw:shadow-xs tw:dark:bg-surface-raised';

/** The list's sort and column controls, at the right end of the filters row. */
function ListHeader({
	sortColumn,
	onSortChange,
	sortOrder,
	onOrderChange,
}: Props): JSX.Element {
	const visibleColumns = useDashboardsListVisibleColumnsStore(
		(s) => s.visibleColumns,
	);
	const setVisibleColumns = useDashboardsListVisibleColumnsStore(
		(s) => s.setVisibleColumns,
	);

	return (
		<div className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-label="Sort"
						data-testid="sort-by"
						className={TRIGGER}
					>
						<span className="tw:text-subtle-foreground">Sort</span>
						{SORT_LABELS[sortColumn]}
						{sortOrder === DashboardtypesListOrderDTO.asc ? (
							<ArrowUp />
						) : (
							<ArrowDown />
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="tw:min-w-44">
					<DropdownMenuLabel>Sort by</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={sortColumn}
						onValueChange={(value): void =>
							onSortChange(value as DashboardtypesListSortDTO)
						}
					>
						{SORT_OPTIONS.map((option) => (
							<DropdownMenuRadioItem
								key={option.value}
								value={option.value}
								data-testid={option.testId}
							>
								{SORT_LABELS[option.value]}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Order</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={sortOrder}
						onValueChange={(value): void =>
							onOrderChange(value as DashboardtypesListOrderDTO)
						}
					>
						{ORDER_OPTIONS.map((option) => (
							<DropdownMenuRadioItem
								key={option.value}
								value={option.value}
								data-testid={option.testId}
							>
								{option.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<TitleTooltip title="Columns">
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							aria-label="Columns"
							data-testid="configure-columns-trigger"
							className={TRIGGER}
						>
							<Columns3 />
						</Button>
					</DropdownMenuTrigger>
				</TitleTooltip>
				<DropdownMenuContent align="end" className="tw:min-w-44">
					<DropdownMenuLabel>Columns</DropdownMenuLabel>
					{METADATA_COLUMNS.map((col) => (
						<DropdownMenuCheckboxItem
							key={col.key}
							checked={visibleColumns[col.key]}
							data-testid={`metadata-toggle-${col.key}`}
							onSelect={(event): void => event.preventDefault()}
							onCheckedChange={(checked): void => {
								void logEvent(DashboardListEvents.ColumnsToggled, {
									column: col.key,
									visible: checked,
								});
								setVisibleColumns({ ...visibleColumns, [col.key]: checked });
							}}
						>
							{col.label}
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

export default ListHeader;
