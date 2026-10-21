import { useCallback, useMemo, useState } from 'react';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import ErrorContent from 'components/ErrorModal/components/ErrorContent';
import {
	useExpression,
	useInputExpression,
	useQuerySearchOnChange,
	useQuerySearchOnRun,
} from 'components/QueryBuilderV2';
import QuerySearch from 'components/QueryBuilderV2/QueryV2/QuerySearch/QuerySearch';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { initialQueryBuilderFormValuesMap } from 'constants/queryBuilder';
import RunQueryBtn from 'container/QueryBuilder/components/RunQueryBtn/RunQueryBtn';
import {
	nextSortOrder,
	TimelineSortOrder,
	timelineRange,
} from 'container/AlertHistory/utils/display';
import { cn } from 'lib/utils';
import {
	useGetAlertRuleDetailsTimelineTable,
	useTimelineTable,
} from 'pages/AlertDetails/hooks';
import { useTimezone } from 'providers/Timezone';
import { DataSource } from 'types/common/queryBuilder';

import TimelineFooter from './TimelineFooter';
import TimelineLoadingRows from './TimelineLoadingRows';
import TimelineRow from './TimelineRow';
import TimelineStateHead from './TimelineStateHead';
import { useAlertHistoryFilterSuggestions } from './useAlertHistoryFilterSuggestions';
import { useTimelineTableData } from './useTimelineTableData';

function TimelineTableContent(): JSX.Element {
	const expression = useExpression();
	const inputExpression = useInputExpression();
	const querySearchOnChange = useQuerySearchOnChange();
	const querySearchOnRun = useQuerySearchOnRun();

	const {
		isLoading,
		isRefetching,
		isError,
		data,
		error,
		ruleId,
		refetch,
		cancel,
	} = useGetAlertRuleDetailsTimelineTable({ filterExpression: expression });

	const apiError = useMemo(() => convertToApiError(error), [error]);

	const { hardcodedAttributeKeys, valueSuggestionsOverride, isLoadingKeys } =
		useAlertHistoryFilterSuggestions(ruleId ?? null);

	const { timelineData, totalItems, nextCursor } = useTimelineTableData(data);

	const {
		paginationConfig,
		onChangeHandler,
		handleNextPage,
		handlePrevPage,
		hasNextPage,
		hasPrevPage,
	} = useTimelineTable({
		totalItems: totalItems ?? 0,
		nextCursor,
	});

	const [sortOrder, setSortOrder] = useState<TimelineSortOrder | null>(null);

	const handleSort = (): void => {
		const next = nextSortOrder(sortOrder);
		setSortOrder(next);
		onChangeHandler({}, {}, { order: next ?? undefined }, {});
	};

	const { formatTimezoneAdjustedTimestamp } = useTimezone();

	const handleRunQuery = useCallback(
		(updatedExpression?: string): void => {
			const nextExpression = updatedExpression ?? inputExpression;
			querySearchOnRun(nextExpression);

			if (nextExpression === expression) {
				refetch();
			}
		},
		[querySearchOnRun, refetch, inputExpression, expression],
	);

	const queryData = useMemo(
		() => ({
			...initialQueryBuilderFormValuesMap.logs,
			queryName: 'A',
			dataSource: DataSource.LOGS,
			filter: { expression },
			expression,
		}),
		[expression],
	);

	const isBusy = isLoading || isRefetching;
	const rows = timelineData ?? [];
	const [start, end] = timelineRange(
		paginationConfig.current ?? 1,
		paginationConfig.pageSize ?? 10,
		totalItems,
	);

	return (
		<div
			className="timeline-table"
			data-testid="timeline-table"
			aria-busy={isBusy}
		>
			{/* If we don't wait to have the keys, the QuerySearch will not render them at first usage */}
			{!isLoadingKeys && hardcodedAttributeKeys ? (
				<div className="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-border tw:px-5 tw:py-3">
					<div className="tw:min-w-0 tw:flex-1" data-testid="timeline-filter-search">
						<QuerySearch
							onChange={querySearchOnChange}
							queryData={queryData}
							dataSource={DataSource.LOGS}
							onRun={handleRunQuery}
							hardcodedAttributeKeys={hardcodedAttributeKeys}
							valueSuggestionsOverride={valueSuggestionsOverride}
						/>
					</div>
					<RunQueryBtn
						isLoadingQueries={isBusy}
						onStageRunQuery={(): void => handleRunQuery()}
						handleCancelQuery={cancel}
					/>
				</div>
			) : (
				<div className="fs-ui tw:border-b tw:border-border tw:px-5 tw:py-3">
					<Skeleton
						data-testid="timeline-filter-skeleton"
						className="tw:h-9 tw:w-full tw:rounded-lg tw:bg-muted"
					/>
				</div>
			)}
			<Table>
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TimelineStateHead order={sortOrder} onSort={handleSort} />
						<TableHead>Labels</TableHead>
						<TableHead className="tw:w-52 tw:text-right">Created at</TableHead>
						<TableHead className="tw:w-24 tw:pr-4 tw:text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody className={cn(isBusy && rows.length > 0 && 'tw:opacity-60')}>
					{isBusy && rows.length === 0 && <TimelineLoadingRows />}
					{rows.map((record) => (
						<TimelineRow
							key={`${record.fingerprint}-${record.value}-${record.unixMilli}`}
							record={record}
							formatTimezoneAdjustedTimestamp={formatTimezoneAdjustedTimestamp}
						/>
					))}
					{!isBusy && rows.length === 0 && (
						<TableRow className="tw:hover:bg-transparent">
							<TableCell
								colSpan={4}
								className="tw:h-28 tw:text-center tw:whitespace-normal tw:text-muted-foreground"
							>
								{isError && apiError ? (
									<div className="tw:text-left" data-testid="timeline-error">
										<ErrorContent error={apiError} />
									</div>
								) : (
									'No state changes in this time range.'
								)}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
			<TimelineFooter
				start={start}
				end={end}
				total={totalItems}
				hasPrevPage={hasPrevPage}
				hasNextPage={hasNextPage}
				onPrevPage={handlePrevPage}
				onNextPage={handleNextPage}
			/>
		</div>
	);
}

export default TimelineTableContent;
