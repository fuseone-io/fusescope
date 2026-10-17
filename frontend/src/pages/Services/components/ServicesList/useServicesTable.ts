import { useMemo, useState } from 'react';
import { SortState } from 'components/PageTemplate/types';
import { compareRows, nextSort, pageOf } from 'components/PageTemplate/utils';
import { ServicesList } from 'types/api/metrics/getService';

import { ColumnKey, PAGE_SIZE } from './constants';

interface ServicesTableState {
	rows: ServicesList[];
	total: number;
	sort: SortState<ColumnKey>;
	onSort: (key: ColumnKey) => void;
	search: string;
	onSearch: (term: string) => void;
	page: number;
	setPage: (page: number) => void;
}

export function useServicesTable(services: ServicesList[]): ServicesTableState {
	const [sort, setSort] = useState<SortState<ColumnKey>>({
		key: ColumnKey.P99,
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
		return [...filtered].sort(compareRows(sort.key, sort.direction));
	}, [search, services, sort]);

	return {
		rows: pageOf(matching, page, PAGE_SIZE),
		total: matching.length,
		sort,
		onSort: (key): void => {
			setSort((current) =>
				nextSort(current, key, key === ColumnKey.Application ? 'asc' : 'desc'),
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
