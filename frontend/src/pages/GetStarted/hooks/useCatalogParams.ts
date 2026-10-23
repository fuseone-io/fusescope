import { useState } from 'react';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';

import { CATALOG_FILTERS } from '../constants';
import type { CatalogFilter } from '../types';

const FILTER_VALUES = CATALOG_FILTERS.map((option) => option.value);

interface CatalogParams {
	query: string;
	setQuery: (query: string) => void;
	filter: CatalogFilter;
	setFilter: (filter: CatalogFilter) => void;
	clear: () => void;
}

/** Search text and goal filter, mirrored to the URL as `?q=` and `?goal=`. */
export function useCatalogParams(): CatalogParams {
	const [queryParam, setQueryParam] = useQueryState(
		'q',
		parseAsString.withDefault(''),
	);
	// The input reads local state: the URL catches up asynchronously, and a
	// controlled input fed from it drops fast keystrokes.
	const [query, setLocalQuery] = useState(queryParam);
	const [filter, setFilterParam] = useQueryState(
		'goal',
		parseAsStringLiteral(FILTER_VALUES).withDefault('all'),
	);

	return {
		query,
		setQuery: (value): void => {
			setLocalQuery(value);
			void setQueryParam(value || null);
		},
		filter,
		setFilter: (value): void => {
			void setFilterParam(value === 'all' ? null : value);
		},
		clear: (): void => {
			setLocalQuery('');
			void setQueryParam(null);
			void setFilterParam(null);
		},
	};
}
