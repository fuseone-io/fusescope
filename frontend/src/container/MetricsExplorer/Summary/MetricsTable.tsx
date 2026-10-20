import { KeyboardEvent } from 'react';
import {
	Querybuildertypesv5OrderByDTO,
	Querybuildertypesv5OrderDirectionDTO,
} from 'api/generated/services/fuseScope.schemas';
import ErrorInPlace from 'components/ErrorInPlace/ErrorInPlace';
import NumberedTablePagination from 'components/PageTemplate/components/NumberedTablePagination';
import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import { Button } from 'components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { Compass, Loader2 } from 'lucide-react';

import MetricNameSearch from './MetricNameSearch';
import { MetricsTableProps } from './types';

const DEFAULT_ORDER_BY: Querybuildertypesv5OrderByDTO = {
	key: { name: 'samples' },
	direction: Querybuildertypesv5OrderDirectionDTO.desc,
};

const SORTABLE_COLUMNS = [
	{ key: 'samples', label: 'Samples' },
	{ key: 'timeseries', label: 'Time series' },
] as const;

function MetricsTable({
	isLoading,
	isError,
	error,
	data,
	pageSize,
	currentPage,
	onPaginationChange,
	setOrderBy,
	orderBy = DEFAULT_ORDER_BY,
	totalCount,
	openMetricDetails,
	queryFilterExpression,
	onFilterChange,
	onOpenInExplorer,
}: MetricsTableProps): JSX.Element {
	const handleSort = (column: string): void => {
		const isActive = orderBy.key?.name === column;
		setOrderBy({
			key: { name: column },
			direction:
				isActive && orderBy.direction === Querybuildertypesv5OrderDirectionDTO.desc
					? Querybuildertypesv5OrderDirectionDTO.asc
					: Querybuildertypesv5OrderDirectionDTO.desc,
		});
	};

	const handleRowKeyDown = (
		event: KeyboardEvent<HTMLTableRowElement>,
		metricName: string,
	): void => {
		if (event.key === 'Enter' && event.target === event.currentTarget) {
			openMetricDetails(metricName, 'list');
		}
	};

	return (
		<section
			aria-label="Metrics list"
			className="metrics-table-container tw:flex tw:min-w-0 tw:flex-col tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised"
		>
			<div
				className="fs-ui tw:px-5 tw:py-3 tw:font-sans"
				data-testid="metrics-table-title"
			>
				<h2 className="tw:text-sm tw:font-semibold tw:text-foreground">
					List view
				</h2>
				<p className="tw:mt-0.5 tw:text-xs tw:text-muted-foreground">
					Each row is a metric received in the selected time range, with the samples
					and time series observed.
				</p>
			</div>
			{isError && error ? (
				<ErrorInPlace error={error} />
			) : (
				<div className="tw:relative tw:border-t tw:border-border">
					<Table className="tw:min-w-[920px] tw:table-fixed">
						<colgroup>
							<col />
							<col className="tw:w-[172px]" />
							<col className="tw:w-[166px]" />
							<col className="tw:w-[120px]" />
							<col className="tw:w-[132px]" />
							<col className="tw:w-[56px]" />
						</colgroup>
						<TableHeader className="tw:bg-surface-sunken">
							<TableRow>
								<TableHead>
									<span className="tw:inline-flex tw:items-center tw:gap-1.5">
										Metric
										<MetricNameSearch
											queryFilterExpression={queryFilterExpression}
											onFilterChange={onFilterChange}
										/>
									</span>
								</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Unit</TableHead>
								{SORTABLE_COLUMNS.map((column) => (
									<SortableTableHead
										key={column.key}
										label={column.label}
										align="right"
										active={orderBy.key?.name === column.key}
										direction={orderBy.direction === 'asc' ? 'asc' : 'desc'}
										onSort={(): void => handleSort(column.key)}
										testId={`metrics-table-sort-${column.key}`}
									/>
								))}
								<TableHead>
									<span className="tw:sr-only">Actions</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((row) => (
								<TableRow
									key={row.key}
									tabIndex={0}
									data-testid={`metrics-table-row-${row.key}`}
									className="clickable-row tw:group tw:cursor-pointer tw:outline-none tw:focus-visible:bg-muted"
									onClick={(event): void => openMetricDetails(row.key, 'list', event)}
									onKeyDown={(event): void => handleRowKeyDown(event, row.key)}
								>
									<TableCell className="tw:h-14 tw:py-2">
										<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
											<span className="tw:truncate tw:font-mono tw:text-[13px] tw:font-medium tw:text-foreground">
												{row.metric_name}
											</span>
											<span className="tw:truncate tw:text-xs tw:text-subtle-foreground">
												{row.description}
											</span>
										</div>
									</TableCell>
									<TableCell>{row.metric_type}</TableCell>
									<TableCell className="tw:truncate tw:text-muted-foreground">
										{row.unit}
									</TableCell>
									<TableCell className="tw:text-right tw:tabular-nums tw:text-foreground">
										{row.samples}
									</TableCell>
									<TableCell className="tw:text-right tw:tabular-nums tw:text-foreground">
										{row.timeseries}
									</TableCell>
									<TableCell className="tw:px-2">
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Open ${row.key} in Explorer`}
											title="Open in Explorer"
											className="tw:text-muted-foreground tw:opacity-0 tw:group-hover:opacity-100 tw:group-focus-within:opacity-100 tw:focus-visible:opacity-100"
											onClick={(event): void => {
												event.stopPropagation();
												onOpenInExplorer(row.key);
											}}
										>
											<Compass />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					{!isLoading && data.length === 0 && (
						<div
							className="fs-ui tw:flex tw:items-center tw:justify-center tw:px-5 tw:py-10 tw:font-sans tw:text-[13px] tw:text-muted-foreground"
							data-testid="metrics-table-empty-state"
						>
							This query had no results. Edit your query and try again!
						</div>
					)}
					{isLoading && (
						<div
							className="fs-ui tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:bg-surface-raised/60"
							data-testid="metrics-table-loading-state"
						>
							<Loader2
								aria-label="Loading metrics"
								className="tw:size-4 tw:animate-spin tw:text-muted-foreground"
							/>
						</div>
					)}
				</div>
			)}
			<NumberedTablePagination
				page={currentPage}
				pageSize={pageSize}
				total={totalCount}
				itemLabel="metrics"
				onChange={onPaginationChange}
			/>
		</section>
	);
}

export default MetricsTable;
