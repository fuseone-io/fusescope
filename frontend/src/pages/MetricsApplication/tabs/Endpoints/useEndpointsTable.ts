import { useMemo, useState } from 'react';
import { SortState } from 'components/PageTemplate/types';
import { nextSort, pageOf } from 'components/PageTemplate/utils';
import { EndpointRow } from 'lib/apm/endpoints';

export type EndpointSortKey = 'rate' | 'p99' | 'errorRate' | 'share';

export const ENDPOINTS_PAGE_SIZE = 10;

interface EndpointsTableState {
	rows: EndpointRow[];
	total: number;
	sort: SortState<EndpointSortKey>;
	onSort: (key: EndpointSortKey) => void;
	search: string;
	onSearch: (term: string) => void;
	page: number;
	setPage: (page: number) => void;
}

/** Search, sort (by time spent until a column is chosen) and paging of the endpoints. */
export function useEndpointsTable(data: EndpointRow[]): EndpointsTableState {
	const [sort, setSort] = useState<SortState<EndpointSortKey>>({
		key: 'share',
		direction: 'desc',
	});
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);

	const matching = useMemo(() => {
		const term = search.trim().toLowerCase();
		const sign = sort.direction === 'asc' ? 1 : -1;
		return data
			.filter((row) => !term || row.name.toLowerCase().includes(term))
			.sort((a, b) => sign * ((a[sort.key] ?? -1) - (b[sort.key] ?? -1)));
	}, [data, search, sort]);

	return {
		rows: pageOf(matching, page, ENDPOINTS_PAGE_SIZE),
		total: matching.length,
		sort,
		onSort: (key): void => {
			setSort((current) => nextSort(current, key));
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
