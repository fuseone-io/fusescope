import {
	Dispatch,
	memo,
	MutableRefObject,
	ReactNode,
	SetStateAction,
	useCallback,
	useEffect,
	useMemo,
} from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import logEvent from 'api/common/logEvent';
import DownloadOptionsMenu from 'components/DownloadOptionsMenu/DownloadOptionsMenu';
import ListViewOrderBy from 'components/OrderBy/ListViewOrderBy';
import type { TableColumnDef } from 'components/TanStackTableView/types';
import TracesTable from 'container/TracesExplorer/TracesTable/TracesTable';
import {
	getFieldColumn,
	TracesTableRow,
} from 'container/TracesExplorer/TracesTable/getFieldColumn';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { LOCALSTORAGE } from 'constants/localStorage';
import { QueryParams } from 'constants/query';
import { initialQueriesMap, PANEL_TYPES } from 'constants/queryBuilder';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { useOptionsMenu } from 'container/OptionsMenu';
import { CustomTimeType } from 'container/TopNav/DateTimeSelectionV2/types';
import ViewActionsPortal from 'container/TracesExplorer/ViewActionsPortal';
import { getListViewQuery } from 'container/TracesExplorer/explorerUtils';
import { useGetQueryRange } from 'hooks/queryBuilder/useGetQueryRange';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { Pagination } from 'hooks/queryPagination';
import { getDefaultPaginationConfig } from 'hooks/queryPagination/utils';
import useUrlQueryData from 'hooks/useUrlQueryData';
import { getListOrderBy, setListOrderBy } from 'utils/explorerUtils';
import { AppState } from 'store/reducers';
import { Warning } from 'types/api';
import { DataSource } from 'types/common/queryBuilder';
import { GlobalReducer } from 'types/reducer/globalTime';

import {
	defaultSelectedColumns,
	PER_PAGE_OPTIONS,
	TIMESTAMP_FIELD,
} from './configs';
import ColumnsOptionsButton from './ColumnsOptionsButton';
import ListViewPagination from './ListViewPagination';
import { getMaxDurationNano, getTraceLink, transformSpanRows } from './utils';

import './ListView.styles.scss';

import styles from './ListView.module.scss';

interface ListViewProps {
	isFilterApplied: boolean;
	setWarning: Dispatch<SetStateAction<Warning | undefined>>;
	setIsLoadingQueries: Dispatch<SetStateAction<boolean>>;
	queryKeyRef?: MutableRefObject<any>;
	headerActions?: ReactNode;
	/** Where the order/download/columns controls render, e.g. the view bar. */
	toolbarTarget?: HTMLElement | null;
}

function ListView({
	isFilterApplied,
	setWarning,
	setIsLoadingQueries,
	queryKeyRef,
	headerActions,
	toolbarTarget,
}: ListViewProps): JSX.Element {
	const {
		stagedQuery,
		currentQuery,
		redirectWithQueryBuilderData,
		panelType: panelTypeFromQueryBuilder,
	} = useQueryBuilder();

	const panelType = panelTypeFromQueryBuilder || PANEL_TYPES.LIST;

	const orderBy = useMemo(() => getListOrderBy(stagedQuery), [stagedQuery]);

	const {
		selectedTime: globalSelectedTime,
		maxTime,
		minTime,
		loading: timeRangeUpdateLoading,
	} = useSelector<AppState, GlobalReducer>((state) => state.globalTime);

	const { options, config } = useOptionsMenu({
		storageKey: LOCALSTORAGE.TRACES_LIST_OPTIONS,
		dataSource: DataSource.TRACES,
		aggregateOperator: 'count',
		initialOptions: {
			selectColumns: defaultSelectedColumns,
		},
	});

	const { queryData: paginationQueryData } = useUrlQueryData<Pagination>(
		QueryParams.pagination,
	);
	const paginationConfig =
		paginationQueryData ?? getDefaultPaginationConfig(PER_PAGE_OPTIONS);

	const requestQuery = useMemo(
		() => getListViewQuery(stagedQuery || initialQueriesMap.traces, orderBy),
		[stagedQuery, orderBy],
	);

	// Stable sorted-name signature for the queryKey.
	// - Drag updates selectColumns; raw queryKey would churn on reorder.
	// - Trace API fetches only listed columns → add/remove must refetch.
	// - Sorted-name signature: stable on reorder, changes on add/remove.
	const selectColumnsSignature = useMemo(
		() =>
			(options?.selectColumns ?? [])
				.map((c) => c.name)
				.sort()
				.join(','),
		[options?.selectColumns],
	);

	const queryKey = useMemo(
		() => [
			REACT_QUERY_KEY.GET_QUERY_RANGE,
			globalSelectedTime,
			maxTime,
			minTime,
			stagedQuery,
			panelType,
			paginationConfig,
			selectColumnsSignature,
		],
		[
			stagedQuery,
			panelType,
			globalSelectedTime,
			paginationConfig,
			selectColumnsSignature,
			maxTime,
			minTime,
		],
	);

	if (queryKeyRef) {
		queryKeyRef.current = queryKey;
	}

	const { data, isFetching, isLoading, isError, error } = useGetQueryRange(
		{
			query: requestQuery,
			graphType: panelType,
			selectedTime: 'GLOBAL_TIME' as const,
			globalSelectedInterval: globalSelectedTime as CustomTimeType,
			params: {
				dataSource: 'traces',
			},
			tableParams: {
				pagination: paginationConfig,
				selectColumns: options?.selectColumns,
			},
		},
		// ENTITY_VERSION_V4,
		ENTITY_VERSION_V5,
		{
			queryKey,
			enabled:
				// don't make api call while the time range state in redux is loading
				!timeRangeUpdateLoading &&
				!!stagedQuery &&
				panelType === PANEL_TYPES.LIST &&
				!!options?.selectColumns?.length,
		},
	);

	useEffect(() => {
		if (data?.payload) {
			setWarning(data?.warning);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.payload, data?.warning]);

	useEffect(() => {
		if (isLoading || isFetching) {
			setIsLoadingQueries(true);
		} else {
			setIsLoadingQueries(false);
		}
	}, [isLoading, isFetching, setIsLoadingQueries]);

	const dataLength =
		data?.payload?.data?.newResult?.data?.result[0]?.list?.length;
	const totalCount = useMemo(() => dataLength || 0, [dataLength]);

	const queryTableDataResult = data?.payload?.data?.newResult?.data?.result;
	const queryTableData = useMemo(
		() => queryTableDataResult || [],
		[queryTableDataResult],
	);

	const rows = useMemo(
		() => transformSpanRows(queryTableData),
		[queryTableData],
	);

	const maxDurationNano = useMemo(() => getMaxDurationNano(rows), [rows]);

	const columns = useMemo<TableColumnDef<TracesTableRow>[]>(() => {
		const fields = [
			TIMESTAMP_FIELD,
			...(options?.selectColumns ?? []).filter(
				(field) => field.name !== TIMESTAMP_FIELD.name,
			),
		];
		return fields.map((field) => getFieldColumn(field, maxDurationNano));
	}, [options?.selectColumns, maxDurationNano]);

	const handleColumnOrderChange = useCallback(
		(cols: TableColumnDef<TracesTableRow>[]): void => {
			config?.addColumn?.onReorder(cols.map((c) => c.id));
		},
		[config],
	);

	const handleOrderChange = useCallback(
		(value: string) => {
			redirectWithQueryBuilderData(setListOrderBy(currentQuery, value));
		},
		[currentQuery, redirectWithQueryBuilderData],
	);

	useEffect(() => {
		if (!isLoading && !isFetching && !isError && rows.length !== 0) {
			void logEvent('Traces Explorer: Data present', {
				panelType,
			});
		}
	}, [isLoading, isFetching, isError, rows, panelType]);

	return (
		<div className={styles.container}>
			<ViewActionsPortal target={toolbarTarget}>
				<div className="trace-explorer-controls">
					{headerActions}
					<div className="order-by-container">
						<div className="order-by-label">Order by</div>

						<ListViewOrderBy
							value={orderBy}
							onChange={handleOrderChange}
							dataSource={DataSource.TRACES}
						/>
					</div>

					<DownloadOptionsMenu
						dataSource={DataSource.TRACES}
						selectedColumns={options?.selectColumns}
					/>

					{config?.fieldsSelector && (
						<ColumnsOptionsButton fieldsSelector={config.fieldsSelector} />
					)}
				</div>
			</ViewActionsPortal>

			<div className={styles.panel}>
				<TracesTable
					data={rows}
					columns={columns}
					columnStorageKey={LOCALSTORAGE.TRACES_LIST_COLUMNS}
					panelType="LIST"
					getRowHref={getTraceLink}
					isLoading={isLoading}
					isFetching={isFetching}
					isError={isError}
					error={error}
					isFilterApplied={isFilterApplied}
					onColumnOrderChange={handleColumnOrderChange}
					onColumnRemove={config?.addColumn?.onRemove}
				/>
				<ListViewPagination
					pageCount={totalCount}
					isLoading={isFetching}
					perPageOptions={PER_PAGE_OPTIONS}
				/>
			</div>
		</div>
	);
}

ListView.defaultProps = {
	queryKeyRef: undefined,
	headerActions: undefined,
	toolbarTarget: undefined,
};

export default memo(ListView);
