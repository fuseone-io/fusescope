import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { Loader, Search } from '@signozhq/icons';
import { Color } from '@signozhq/design-tokens';
import {
	Button,
	Flex,
	Input,
	InputRef,
	Space,
	Spin,
	TableColumnsType,
	TableColumnType,
	Tooltip,
} from 'antd';
import { Typography } from '@signozhq/ui/typography';
import type { FilterDropdownProps } from 'antd/lib/table/interface';
import logEvent from 'api/common/logEvent';
import {
	getQueueOverview,
	QueueOverviewResponse,
} from 'api/messagingQueues/celery/getQueueOverview';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import ShareBar from 'components/PageTemplate/components/ShareBar';
import TagChip from 'components/PageTemplate/components/TagChip';
import tableStyles from 'components/MessagingQueues/MQTable.module.scss';
import { ResizeTable } from 'components/ResizeTable';
import { LOCALSTORAGE } from 'constants/localStorage';
import { QueryParams } from 'constants/query';
import useDragColumns from 'hooks/useDragColumns';
import { getDraggedColumns } from 'hooks/useDragColumns/utils';
import useUrlQuery from 'hooks/useUrlQuery';
import { isEmpty } from 'lodash-es';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';
import { formatNumericValue } from 'utils/numericUtils';

const INITIAL_PAGE_SIZE = 20;

const showPaginationItem = (total: number, range: number[]): JSX.Element => (
	<>
		<Typography.Text className="numbers">
			{range[0]} &#8212; {range[1]}
		</Typography.Text>
		<Typography.Text className="total"> of {total}</Typography.Text>
	</>
);

export type RowData = {
	key: string | number;
	[key: string]: string | number;
};

const ERROR_RATE_ALERT = 5;

function ErrorRateRender(item: string | number): JSX.Element {
	const percent = Number(Number(item).toFixed(1));
	return (
		<ShareBar
			value={percent}
			tone={percent >= ERROR_RATE_ALERT ? 'error' : 'primary'}
			text={`${percent}%`}
			className="fs-ui tw:font-sans"
		/>
	);
}

function withUnit(unit: string): (item: string | number) => JSX.Element {
	return function UnitCell(item: string | number): JSX.Element {
		return (
			<span className="tw:tabular-nums">
				{formatNumericValue(item)}
				<span className="tw:ml-1 tw:text-subtle-foreground">{unit}</span>
			</span>
		);
	};
}

function monoRender(className: string): (item: string) => JSX.Element {
	return function TextCell(item: string): JSX.Element {
		return (
			<Tooltip placement="topLeft" title={item}>
				<span className={className}>{item}</span>
			</Tooltip>
		);
	};
}

const getColumnSearchProps = (
	searchInput: React.RefObject<InputRef>,
	handleReset: (
		clearFilters: () => void,
		confirm: FilterDropdownProps['confirm'],
	) => void,
	handleSearch: (selectedKeys: string[], confirm: () => void) => void,
	dataIndex?: string,
): TableColumnType<RowData> => ({
	filterDropdown: ({
		setSelectedKeys,
		selectedKeys,
		confirm,
		clearFilters,
		close,
	}): JSX.Element => (
		<div style={{ padding: 8 }} onKeyDown={(e): void => e.stopPropagation()}>
			<Input
				ref={searchInput}
				placeholder={`Search ${dataIndex}`}
				value={selectedKeys[0]}
				onChange={(e): void =>
					setSelectedKeys(e.target.value ? [e.target.value] : [])
				}
				onPressEnter={(): void => handleSearch(selectedKeys as string[], confirm)}
				style={{ marginBottom: 8, display: 'block' }}
			/>
			<Space>
				<Button
					type="primary"
					size="small"
					onClick={(): void => handleSearch(selectedKeys as string[], confirm)}
				>
					<Flex align="center" gap={4}>
						<Search size="md" />
						Search
					</Flex>
				</Button>
				<Button
					onClick={(): void => clearFilters && handleReset(clearFilters, confirm)}
					size="small"
					style={{ width: 90 }}
				>
					Reset
				</Button>
				<Button
					type="link"
					size="small"
					onClick={(): void => {
						close();
					}}
				>
					close
				</Button>
			</Space>
		</div>
	),
	filterIcon: (filtered: boolean): JSX.Element => (
		<Search
			style={{ color: filtered ? Color.BG_ROBIN_500 : undefined }}
			size="md"
		/>
	),
	onFilter: (value, record): boolean =>
		record[dataIndex || '']
			.toString()
			.toLowerCase()
			.includes((value as string).toLowerCase()),
});

function getColumns(): TableColumnsType<RowData> {
	const systemRender = (item: string): JSX.Element => (
		<TagChip className="fs-ui">{item}</TagChip>
	);

	return [
		{
			title: 'Service',
			dataIndex: 'service_name',
			key: 'service_name',
			ellipsis: {
				showTitle: false,
			},
			width: 170,
			sorter: (a: RowData, b: RowData): number =>
				String(a.service_name).localeCompare(String(b.service_name)),
			render: monoRender('tw:font-mono tw:font-medium'),
			fixed: 'left',
		},
		{
			title: 'Span name',
			dataIndex: 'span_name',
			key: 'span_name',
			ellipsis: {
				showTitle: false,
			},
			width: 210,
			sorter: (a: RowData, b: RowData): number =>
				String(a.span_name).localeCompare(String(b.span_name)),
			render: monoRender('tw:font-mono tw:text-xs tw:text-muted-foreground'),
		},
		{
			title: 'System',
			dataIndex: 'messaging_system',
			key: 'messaging_system',
			ellipsis: {
				showTitle: false,
			},
			width: 100,
			sorter: (a: RowData, b: RowData): number =>
				String(a.messaging_system).localeCompare(String(b.messaging_system)),
			render: systemRender,
		},
		{
			title: 'Destination',
			dataIndex: 'destination',
			key: 'destination',
			ellipsis: {
				showTitle: false,
			},
			render: monoRender('tw:font-mono tw:text-xs'),
			width: 150,
			sorter: (a: RowData, b: RowData): number =>
				String(a.destination).localeCompare(String(b.destination)),
		},
		{
			title: 'Kind',
			dataIndex: 'kind_string',
			key: 'kind_string',
			ellipsis: {
				showTitle: false,
			},
			width: 100,
			sorter: (a: RowData, b: RowData): number =>
				String(a.kind_string).localeCompare(String(b.kind_string)),
			render: monoRender('tw:text-muted-foreground'),
		},
		{
			title: 'Error %',
			dataIndex: 'error_percentage',
			key: 'error_percentage',
			ellipsis: {
				showTitle: false,
			},
			width: 170,
			sorter: (a: RowData, b: RowData): number => {
				const aValue = Number(a.error_percentage);
				const bValue = Number(b.error_percentage);
				return aValue - bValue;
			},
			render: ErrorRateRender,
		},
		{
			title: 'p95 latency',
			align: 'right',
			dataIndex: 'p95_latency',
			key: 'p95_latency',
			ellipsis: {
				showTitle: false,
			},
			width: 120,
			sorter: (a: RowData, b: RowData): number => {
				const aValue = Number(a.p95_latency);
				const bValue = Number(b.p95_latency);
				return aValue - bValue;
			},
			render: withUnit('ms'),
		},
		{
			title: 'Throughput',
			align: 'right',
			dataIndex: 'throughput',
			key: 'throughput',
			ellipsis: {
				showTitle: false,
			},
			width: 130,
			sorter: (a: RowData, b: RowData): number => {
				const aValue = Number(a.throughput);
				const bValue = Number(b.throughput);
				return aValue - bValue;
			},
			render: withUnit('ops/s'),
		},
	];
}

function getTableData(data: QueueOverviewResponse['data']): RowData[] {
	if (data?.length === 0) {
		return [];
	}

	const columnOrder = [
		'service_name',
		'span_name',
		'messaging_system',
		'destination',
		'kind_string',
		'error_percentage',
		'p95_latency',
		'throughput',
	];

	const tableData: RowData[] =
		data?.map((row, index: number): RowData => {
			const rowData: Record<string, string | number> = {};
			columnOrder.forEach((key) => {
				const value = row.data[key as keyof typeof row.data];
				if (typeof value === 'string' || typeof value === 'number') {
					rowData[key] = value;
				}
			});
			Object.entries(row.data).forEach(([key, value]) => {
				if (
					!columnOrder.includes(key) &&
					(typeof value === 'string' || typeof value === 'number')
				) {
					rowData[key] = value;
				}
			});

			return {
				...rowData,
				key: index,
			};
		}) || [];

	return tableData;
}

type Filter = {
	key: {
		key: string;
		dataType: string;
	};
	op: string;
	value: string[];
};

type FilterConfig = {
	paramName: string;
	operator: string;
	key: string;
};

function makeFilters(urlQuery: URLSearchParams): Filter[] {
	const filterConfigs: FilterConfig[] = [
		{ paramName: QueryParams.destination, key: 'destination', operator: 'in' },
		{ paramName: QueryParams.msgSystem, key: 'queue', operator: 'in' },
		{ paramName: QueryParams.kindString, key: 'kind_string', operator: 'in' },
		{ paramName: QueryParams.service, key: 'service.name', operator: 'in' },
		{ paramName: QueryParams.spanName, key: 'name', operator: 'in' },
	];

	return filterConfigs
		.map(({ paramName, operator, key }) => {
			const value = urlQuery.get(paramName);
			if (!value) {
				return null;
			}

			return {
				key: {
					key,
					dataType: 'string',
				},
				op: operator,
				value: value.split(','),
			};
		})
		.filter((filter): filter is Filter => filter !== null);
}

export default function CeleryOverviewTable({
	onRowClick,
	searchText,
	onSearchChange,
	selectedRowKey,
}: {
	onRowClick: (record: RowData) => void;
	searchText: string;
	onSearchChange: (text: string) => void;
	selectedRowKey?: RowData['key'];
}): JSX.Element {
	const [tableData, setTableData] = useState<RowData[]>([]);

	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const { mutate: getOverviewData, isLoading } = useMutation(getQueueOverview, {
		onSuccess: (data) => {
			if (data?.payload) {
				setTableData(getTableData(data?.payload));
			} else if (isEmpty(data?.payload)) {
				setTableData([]);
			}
		},
	});

	const urlQuery = useUrlQuery();
	const filters = useMemo(() => makeFilters(urlQuery), [urlQuery]);

	useEffect(() => {
		getOverviewData({
			start: minTime,
			end: maxTime,
			filters: {
				items: filters,
				op: 'AND',
			},
		});
	}, [getOverviewData, minTime, maxTime, filters]);

	const { draggedColumns, onDragColumns } = useDragColumns<RowData>(
		LOCALSTORAGE.CELERY_OVERVIEW_COLUMNS,
	);

	const searchInput = useRef<InputRef>(null);

	const handleSearch = (
		selectedKeys: string[],
		confirm: FilterDropdownProps['confirm'],
	): void => {
		confirm();
		onSearchChange(selectedKeys[0]);
	};

	const handleReset = (
		clearFilters: () => void,
		confirm: FilterDropdownProps['confirm'],
	): void => {
		clearFilters();
		onSearchChange('');
		confirm();
	};

	// Add defaultSorting state
	const [sortedInfo, setSortedInfo] = useState<{
		columnKey: string;
		order: 'ascend' | 'descend';
	}>({
		columnKey: 'error_percentage',
		order: 'descend',
	});

	const columns = useMemo(
		() =>
			getDraggedColumns<RowData>(
				getColumns().map((item) => ({
					...item,
					...getColumnSearchProps(
						searchInput,
						handleReset,
						handleSearch,
						item.key?.toString(),
					),
					// Only set defaultSortOrder for error_percentage, but allow sorting for all columns
					...(item.key === 'error_percentage' && {
						defaultSortOrder: 'descend',
					}),
					sortOrder: sortedInfo.columnKey === item.key ? sortedInfo.order : null,
				})),
				draggedColumns,
			),
		[tableData, draggedColumns, sortedInfo],
	);
	const handleDragColumn = useCallback(
		(fromIndex: number, toIndex: number) =>
			onDragColumns(columns, fromIndex, toIndex),
		[columns, onDragColumns],
	);

	const paginationConfig = useMemo(
		() =>
			tableData?.length > INITIAL_PAGE_SIZE && {
				pageSize: INITIAL_PAGE_SIZE,
				showTotal: showPaginationItem,
				showSizeChanger: false,
				hideOnSinglePage: true,
			},
		[tableData],
	);

	const handleRowClick = (record: RowData): void => {
		onRowClick(record);
		logEvent('MQ Overview Page: Right Panel', { ...record });
	};

	const getFilteredData = useCallback(
		(data: RowData[]): RowData[] => {
			if (!searchText) {
				return data;
			}

			const searchLower = searchText.toLowerCase();
			return data.filter((record) =>
				Object.values(record).some(
					(value) =>
						value !== undefined &&
						value.toString().toLowerCase().includes(searchLower),
				),
			);
		},
		[searchText],
	);

	const filteredData = useMemo(
		() => getFilteredData(tableData),
		[getFilteredData, tableData],
	);

	const prevTableDataRef = useRef<string>();

	useEffect(() => {
		if (tableData.length > 0) {
			const currentTableData = JSON.stringify(tableData);

			if (currentTableData !== prevTableDataRef.current) {
				logEvent(`MQ Overview Page: List rendered`, {
					dataRender: tableData.length,
				});
				prevTableDataRef.current = currentTableData;
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [JSON.stringify(tableData)]);

	return (
		<ContentPanel
			testId="mq-overview-table"
			divided
			bodyClassName={tableStyles.skin}
			title="Producer and consumer operations"
			subtitle="From spans with messaging.system set, sorted by error rate. Select a row for its rate, errors and latency."
		>
			<ResizeTable
				className="celery-overview-table"
				pagination={paginationConfig}
				size="middle"
				columns={columns}
				dataSource={filteredData}
				bordered={false}
				loading={{
					spinning: isLoading,
					indicator: (
						<Spin indicator={<Loader size={14} className="animate-spin" />} />
					),
				}}
				locale={{
					emptyText: isLoading ? null : (
						<Typography.Text>
							{searchText
								? `No operations match “${searchText}”.`
								: 'No producer or consumer operations in this time range.'}
						</Typography.Text>
					),
				}}
				scroll={{ x: 'max-content' }}
				showSorterTooltip
				onDragColumn={handleDragColumn}
				onRow={(record): { onClick: () => void; className: string } => ({
					onClick: (): void => handleRowClick(record),
					className:
						record.key === selectedRowKey
							? 'clickable-row is-selected'
							: 'clickable-row',
				})}
				tableLayout="fixed"
				onChange={(_pagination, _filters, sorter): void => {
					setSortedInfo({
						columnKey: (sorter as { columnKey: string }).columnKey,
						order: (sorter as { order: 'ascend' | 'descend' }).order,
					});
				}}
			/>
		</ContentPanel>
	);
}
