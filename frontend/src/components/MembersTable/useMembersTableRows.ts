import { useMemo, useState } from 'react';
import { SortState } from 'components/PageTemplate/types';
import { nextSort, pageOf } from 'components/PageTemplate/utils';

import { MemberRow, MemberSortKey } from './types';

const byJoinedOn = (a: MemberRow, b: MemberRow): number => {
	if (!a.joinedOn && !b.joinedOn) {
		return 0;
	}
	if (!a.joinedOn) {
		return 1;
	}
	if (!b.joinedOn) {
		return -1;
	}
	return new Date(a.joinedOn).getTime() - new Date(b.joinedOn).getTime();
};

const COMPARATORS: Record<
	MemberSortKey,
	(a: MemberRow, b: MemberRow) => number
> = {
	name: (a, b) => a.email.localeCompare(b.email),
	status: (a, b) => a.status.localeCompare(b.status),
	joinedOn: byJoinedOn,
};

interface MembersTableRows {
	rows: MemberRow[];
	sort: SortState<MemberSortKey> | null;
	onSort: (key: MemberSortKey) => void;
}

/** Sorts, then cuts the current page; unsorted keeps the API order. */
export function useMembersTableRows(
	data: MemberRow[],
	currentPage: number,
	pageSize: number,
): MembersTableRows {
	const [sort, setSort] = useState<SortState<MemberSortKey> | null>(null);

	const rows = useMemo(() => {
		if (!sort) {
			return pageOf(data, currentPage, pageSize);
		}
		const sign = sort.direction === 'asc' ? 1 : -1;
		const compare = COMPARATORS[sort.key];
		const sorted = [...data].sort((a, b) => sign * compare(a, b));
		return pageOf(sorted, currentPage, pageSize);
	}, [data, sort, currentPage, pageSize]);

	const onSort = (key: MemberSortKey): void =>
		setSort((current) =>
			current ? nextSort(current, key, 'asc') : { key, direction: 'asc' },
		);

	return { rows, sort, onSort };
}
