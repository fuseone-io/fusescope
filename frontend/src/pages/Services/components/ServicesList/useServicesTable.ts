import { useMemo, useState } from 'react';
import { SortState } from 'components/PageTemplate/types';
import { compareRows, nextSort, pageOf } from 'components/PageTemplate/utils';

import { ColumnKey, PAGE_SIZE, ServiceSortKey } from './constants';
import { compareFlagged, ServiceRow } from './serviceRows';

interface ServicesTableState {
	rows: ServiceRow[];
	total: number;
	sort: SortState<ServiceSortKey>;
	onSort: (key: ColumnKey) => void;
	search: string;
	onSearch: (term: string) => void;
	page: number;
	setPage: (page: number) => void;
}

/** Highlighted services come first until a column is sorted. */
export function useServicesTable(services: ServiceRow[]): ServicesTableState {
	const [sort, setSort] = useState<SortState<ServiceSortKey>>({
		key: 'flag',
		direction: 'desc',
	});
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);

	const matching = useMemo(() => {
		const term = search.trim().toLowerCase();
		const filtered = term
			? services.filter((service) =>
					service.serviceName.toLowerCase().includes(term),
				)
			: services;
		const compare =
			sort.key === 'flag'
				? compareFlagged
				: compareRows<ServiceRow, ColumnKey>(sort.key, sort.direction);
		return [...filtered].sort(compare);
	}, [search, services, sort]);

	return {
		rows: pageOf(matching, page, PAGE_SIZE),
		total: matching.length,
		sort,
		onSort: (key): void => {
			setSort((current) =>
				nextSort<ServiceSortKey>(
					current,
					key,
					key === ColumnKey.Application ? 'asc' : 'desc',
				),
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
