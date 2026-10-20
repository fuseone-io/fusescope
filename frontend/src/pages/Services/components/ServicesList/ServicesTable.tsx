import { useLocation } from 'react-router-dom';
import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { SortState } from 'components/PageTemplate/types';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { ServicesList } from 'types/api/metrics/getService';
import { isModifierKeyPressed } from 'utils/app';

import { ColumnKey, ColumnTitle } from './constants';
import ServiceNameCell from './ServiceNameCell';
import { errorRateTone, formatP99, serviceUrl } from './utils';

interface ServicesTableProps {
	loading: boolean;
	rows: ServicesList[];
	sort: SortState<ColumnKey>;
	onSort: (key: ColumnKey) => void;
	isMetricData: boolean;
}

interface Column {
	key: ColumnKey;
	label: string;
	align: 'left' | 'right';
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'];

function ServicesTable({
	loading,
	rows,
	sort,
	onSort,
	isMetricData,
}: ServicesTableProps): JSX.Element {
	const { search } = useLocation();
	const { safeNavigate } = useSafeNavigate();

	const columns: Column[] = [
		{
			key: ColumnKey.Application,
			label: ColumnTitle[ColumnKey.Application],
			align: 'left',
		},
		{
			key: ColumnKey.P99,
			label: `${ColumnTitle[ColumnKey.P99]} (in ms)`,
			align: 'right',
		},
		{
			key: ColumnKey.ErrorRate,
			label: ColumnTitle[ColumnKey.ErrorRate],
			align: 'right',
		},
		{
			key: ColumnKey.Operations,
			label: ColumnTitle[ColumnKey.Operations],
			align: 'right',
		},
	];

	return (
		<Table className="tw:min-w-[640px]">
			<TableHeader>
				<TableRow>
					{columns.map((column) => (
						<SortableTableHead
							key={column.key}
							label={column.label}
							align={column.align}
							active={sort.key === column.key}
							direction={sort.direction}
							onSort={(): void => onSort(column.key)}
							testId={`services-sort-${column.key}`}
							className={
								column.key === ColumnKey.Application ? 'tw:w-[40%]' : undefined
							}
						/>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading &&
					SKELETON_ROWS.map((row) => (
						<TableRow key={row} data-testid="service-row-loading">
							<TableCell colSpan={columns.length}>
								<Skeleton className="tw:h-5 tw:bg-muted" />
							</TableCell>
						</TableRow>
					))}
				{!loading &&
					rows.map((service) => {
						const href = serviceUrl(service.serviceName, search);
						return (
							<TableRow
								key={service.serviceName}
								data-testid="service-row"
								className="tw:cursor-pointer"
								onClick={(event): void =>
									safeNavigate(href, { newTab: isModifierKeyPressed(event) })
								}
							>
								<TableCell className="tw:max-w-0">
									<ServiceNameCell service={service} href={href} />
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{formatP99(service.p99, isMetricData)}
								</TableCell>
								<TableCell className="tw:text-right">
									<StatusBadge tone={errorRateTone(service.errorRate)}>
										{service.errorRate.toFixed(2)}
									</StatusBadge>
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{service.callRate.toFixed(2)}
								</TableCell>
							</TableRow>
						);
					})}
			</TableBody>
		</Table>
	);
}

export default ServicesTable;
