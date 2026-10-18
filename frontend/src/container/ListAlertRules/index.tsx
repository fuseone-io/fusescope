import { useCallback, useMemo } from 'react';
import cx from 'classnames';
import ErrorEmptyState from 'components/Alerts/ErrorEmptyState';
import NoResultsEmptyState from 'components/Alerts/NoResultsEmptyState';
import tablePanel from 'components/Alerts/TablePanel.module.scss';
import ToolbarSearch from 'components/Alerts/ToolbarSearch/ToolbarSearch';
import TanStackTable from 'components/TanStackTableView';
import { useCalculatedPageSize } from 'components/TanStackTableView/useCalculatedPageSize';
import { useTableParams } from 'components/TanStackTableView/useTableParams';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import useComponentPermission from 'hooks/useComponentPermission';
import { useUrlSearchState } from 'hooks/useUrlSearchState';
import { useAppContext } from 'providers/App/App';
import { useTimezone } from 'providers/Timezone';
import { Plus } from 'lucide-react';

import TextToolTip from 'components/TextToolTip';

import { AlertsEmptyState } from './AlertsEmptyState/AlertsEmptyState';
import { ActionsMenu, ColumnSelector } from './components';
import { ALERT_RULES_PARAMS, useAlertRulesFilters } from './hooks';
import styles from './ListAlertRules.module.scss';
import { getAlertRuleColumns } from './table.config';
import type { AlertRule } from './types';
import { useAlertRulesStripInfo } from './useAlertRulesStripInfo';
import { useAlertRulesData } from './useAlertRulesData';
import { useAlertRulesHandlers } from './useAlertRulesHandlers';

const QUERY_PARAMS_CONFIG = {
	orderBy: 'orderBy',
	page: 'page',
	limit: 'limit',
} as const;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

function ListAlertRules(): JSX.Element {
	const { user } = useAppContext();
	const [addNewAlert, action] = useComponentPermission(
		['add_new_alert', 'action'],
		user.role,
	);

	const [filterValues, setFilterValues] = useAlertRulesFilters();
	const { formatTimezoneAdjustedTimestamp } = useTimezone();

	const { containerRef, calculatedPageSize } = useCalculatedPageSize({
		rowHeight: 46,
	});

	const { orderBy, page, limit, setLimit, setPage } = useTableParams(
		QUERY_PARAMS_CONFIG,
		{
			page: DEFAULT_PAGE,
			limit: DEFAULT_LIMIT,
			storageKey: 'alert-rules',
			calculatedPageSize,
			cleanupOnUnmount: true,
		},
	);

	const resetPageOnSearch = useCallback((): void => {
		setPage(1);
	}, [setPage]);

	const { searchText, debouncedSearch, handleSearchChange, clearSearch } =
		useUrlSearchState(ALERT_RULES_PARAMS.SEARCH, {
			onDebouncedChange: resetPageOnSearch,
		});

	const { filteredRules, isFetching, isError, allRules, refetch } =
		useAlertRulesData(orderBy, debouncedSearch, filterValues ?? []);

	const { handleEdit, handleNewAlert, handleRowClick, handleRowClickNewTab } =
		useAlertRulesHandlers(allRules.length);

	const handleClearFilters = useCallback((): void => {
		void setFilterValues(null);
		clearSearch();
	}, [setFilterValues, clearSearch]);

	const columns = useMemo(
		() => getAlertRuleColumns(formatTimezoneAdjustedTimestamp),
		[formatTimezoneAdjustedTimestamp],
	);

	const paginatedRules = useMemo(() => {
		const start = (page - 1) * limit;
		return filteredRules.slice(start, start + limit);
	}, [filteredRules, page, limit]);

	useAlertRulesStripInfo({
		shownCount: paginatedRules.length,
		totalCount: filteredRules.length,
	});

	const columnsWithActions = useMemo(() => {
		if (!action) {
			return columns;
		}

		return [
			...columns,
			{
				id: 'actions',
				header: (): JSX.Element => (
					<span style={{ textAlign: 'right', display: 'block' }}>Actions</span>
				),
				accessorKey: 'id',
				width: { fixed: '96px', ignoreLastColumnFill: true },
				enableSort: false,
				enableRemove: false,
				enableMove: false,
				pin: 'right' as const,
				cell: ({ row }: { row: AlertRule }): JSX.Element => (
					<div className={styles.actionsColumn}>
						<ActionsMenu rule={row} onEdit={handleEdit} />
					</div>
				),
			},
		];
	}, [action, columns, handleEdit]);

	const hasActiveFilters =
		searchText.length > 0 || (filterValues ?? []).length > 0;
	const isEmptyDueToFilters =
		!isFetching &&
		filteredRules.length === 0 &&
		hasActiveFilters &&
		allRules.length > 0;
	const isEmptyNoRules = !isFetching && !isError && allRules.length === 0;

	return (
		<div className={styles.container}>
			{!isEmptyNoRules && (
				<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
					<ToolbarSearch
						placeholder="Search by Alert Name, Severity and Labels"
						value={searchText}
						onChange={handleSearchChange}
						testId="list-alerts-search-input"
					/>
					<div className="tw:flex tw:items-center tw:gap-2">
						<TextToolTip
							text="More details on how to create alerts"
							url={fuseScopeDocsUrl('/alerts/alert-rules/')}
							urlText="Learn More"
						/>
						<ColumnSelector columns={columns} storageKey="alert-rules-columns" />
						{addNewAlert && (
							<Button
								className="fs-ui tw:font-sans"
								onClick={handleNewAlert}
								data-testid="list-alerts-new-alert-button"
							>
								<Plus aria-hidden="true" />
								New Alert
							</Button>
						)}
					</div>
				</div>
			)}

			<div
				ref={containerRef}
				className={cx(styles.tableContainer, !isEmptyNoRules && tablePanel.panel)}
			>
				{isError ? (
					<ErrorEmptyState title="Failed to load alert rules" onRefresh={refetch} />
				) : isEmptyDueToFilters ? (
					<NoResultsEmptyState
						title="No matching alert rules"
						subtitle="No alert rules match your search. Try adjusting your search criteria."
						onClear={handleClearFilters}
						clearButtonText="Clear Search"
					/>
				) : isEmptyNoRules ? (
					<AlertsEmptyState onRefresh={refetch} />
				) : (
					<TanStackTable<AlertRule>
						data={paginatedRules}
						columns={columnsWithActions}
						isLoading={isFetching}
						getRowKey={(row): string => row.id ?? ''}
						getItemKey={(row): string => row.id ?? ''}
						columnStorageKey="alert-rules-columns"
						enableQueryParams={QUERY_PARAMS_CONFIG}
						onRowClick={handleRowClick}
						onRowClickNewTab={handleRowClickNewTab}
						pagination={{
							total: filteredRules.length,
							calculatedPageSize,
							onLimitChange: setLimit,
							showTotalCount: true,
						}}
						paginationClassname={styles.paginationContainer}
						enableAlternatingRowColors
						plainTextCellLineClamp={2}
					/>
				)}
			</div>
		</div>
	);
}

export default ListAlertRules;
