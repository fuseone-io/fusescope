import { useMemo, useState } from 'react';
import { SortState } from 'components/PageTemplate/types';
import { nextSort, pageOf } from 'components/PageTemplate/utils';
import { ServiceAccountRow } from 'container/ServiceAccountsSettings/utils';

export type SASortKey = 'name' | 'status';

const activeFirst = (row: ServiceAccountRow): number =>
	row.status?.toUpperCase() === 'ACTIVE' ? 0 : 1;

const COMPARATORS: Record<
	SASortKey,
	(a: ServiceAccountRow, b: ServiceAccountRow) => number
> = {
	name: (a, b) => a.email.localeCompare(b.email),
	status: (a, b) => activeFirst(a) - activeFirst(b),
};

interface ServiceAccountsTableRows {
	rows: ServiceAccountRow[];
	sort: SortState<SASortKey> | null;
	onSort: (key: SASortKey) => void;
}

/** Sorts, then cuts the current page; unsorted keeps the API order. */
export function useServiceAccountsTableRows(
	data: ServiceAccountRow[],
	currentPage: number,
	pageSize: number,
): ServiceAccountsTableRows {
	const [sort, setSort] = useState<SortState<SASortKey> | null>(null);

	const rows = useMemo(() => {
		if (!sort) {
			return pageOf(data, currentPage, pageSize);
		}
		const sign = sort.direction === 'asc' ? 1 : -1;
		const compare = COMPARATORS[sort.key];
		return pageOf(
			[...data].sort((a, b) => sign * compare(a, b)),
			currentPage,
			pageSize,
		);
	}, [data, sort, currentPage, pageSize]);

	const onSort = (key: SASortKey): void =>
		setSort((current) =>
			current ? nextSort(current, key, 'asc') : { key, direction: 'asc' },
		);

	return { rows, sort, onSort };
}
