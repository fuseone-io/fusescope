import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import { nextSort } from 'components/PageTemplate/utils';
import { Table, TableBody, TableHeader, TableRow } from 'components/ui/table';

import EmptyRow from '../../components/EmptyRow';
import { HIDDEN_BELOW_70REM, HIDDEN_BELOW_75REM } from '../constants';
import { ViewRow, ViewSort, ViewSortKey } from '../types';
import RouteRow from './RouteRow';

interface RoutesTableProps {
	rows: ViewRow[];
	sort: ViewSort;
	onSort: (sort: ViewSort) => void;
	selected: string;
	onOpen: (route: string) => void;
	empty?: string;
}

const COLUMNS: {
	key: ViewSortKey;
	label: string;
	right?: boolean;
	className?: string;
}[] = [
	{ key: 'route', label: 'Route' },
	{ key: 'pageLoads', label: 'Page loads', right: true },
	{
		key: 'routeChanges',
		label: 'Route changes',
		right: true,
		className: HIDDEN_BELOW_75REM,
	},
	{ key: 'lcp', label: 'LCP p75' },
	{ key: 'inp', label: 'INP p75' },
	{ key: 'cls', label: 'CLS p75' },
	{
		key: 'timeOnView',
		label: 'Time on view',
		right: true,
		className: HIDDEN_BELOW_70REM,
	},
	{ key: 'errors', label: 'Errors', right: true },
	{ key: 'slowest', label: 'Slowest request' },
];

function RoutesTable({
	rows,
	sort,
	onSort,
	selected,
	onOpen,
	empty,
}: RoutesTableProps): JSX.Element {
	return (
		<div className="tw:@container/routes tw:overflow-x-auto">
			<Table className="tw:min-w-[880px] tw:[&_td]:px-3 tw:[&_th]:px-3 tw:[&_td:first-child]:pl-5 tw:[&_th:first-child]:pl-5 tw:[&_td:last-child]:pr-5 tw:[&_th:last-child]:pr-5">
				<TableHeader>
					<TableRow>
						{COLUMNS.map((column) => (
							<SortableTableHead
								key={column.key}
								label={column.label}
								active={sort.key === column.key}
								direction={sort.direction}
								onSort={(): void =>
									onSort(
										nextSort(sort, column.key, column.key === 'route' ? 'asc' : 'desc'),
									)
								}
								align={column.right ? 'right' : 'left'}
								testId={`rum-views-sort-${column.key}`}
								className={column.className}
							/>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<RouteRow
							key={row.route}
							row={row}
							selected={row.route === selected}
							onOpen={onOpen}
						/>
					))}
					{empty && <EmptyRow columns={COLUMNS.length}>{empty}</EmptyRow>}
				</TableBody>
			</Table>
		</div>
	);
}

export default RoutesTable;
