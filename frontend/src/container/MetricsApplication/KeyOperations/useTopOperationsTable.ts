import { useMemo, useState } from 'react';
import { SortState } from 'components/PageTemplate/types';
import { compareRows, nextSort, pageOf } from 'components/PageTemplate/utils';

import type { TopOperationList } from './types';
import { getErrorRate } from '../utils';

export type OperationSortKey = 'p50' | 'p95' | 'p99' | 'numCalls' | 'errorRate';

export type OperationRow = TopOperationList & {
	errorRate: number;
	/** Share of all calls in the table, in percent. */
	callShare: number;
};

export const OPERATIONS_PAGE_SIZE = 10;

interface TopOperationsTableState {
	rows: OperationRow[];
	total: number;
	sort: SortState<OperationSortKey> | null;
	onSort: (key: OperationSortKey) => void;
	search: string;
	onSearch: (term: string) => void;
	page: number;
	setPage: (page: number) => void;
}

/** Rows keep the API's order until a column is sorted. */
export function useTopOperationsTable(
	data: TopOperationList[],
): TopOperationsTableState {
	const [sort, setSort] = useState<SortState<OperationSortKey> | null>(null);
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);

	const matching = useMemo(() => {
		const totalCalls = data.reduce((sum, item) => sum + item.numCalls, 0);
		const term = search.trim().toLowerCase();
		const rows: OperationRow[] = data
			.filter((item) => !term || item.name.toLowerCase().includes(term))
			.map((item) => ({
				...item,
				errorRate: getErrorRate(item),
				callShare: totalCalls ? (item.numCalls / totalCalls) * 100 : 0,
			}));
		return sort ? rows.sort(compareRows(sort.key, sort.direction)) : rows;
	}, [data, search, sort]);

	return {
		rows: pageOf(matching, page, OPERATIONS_PAGE_SIZE),
		total: matching.length,
		sort,
		onSort: (key): void => {
			setSort((current) =>
				current ? nextSort(current, key) : { key, direction: 'desc' },
			);
			setPage(1);
		},
		search,
		onSearch: (term): void => {
			setSearch(term);
			setPage(1);
		},
		page,
		setPage,
	};
}
