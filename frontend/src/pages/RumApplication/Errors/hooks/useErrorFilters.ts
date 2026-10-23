import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from 'hooks/useSafeNavigate';

import { ErrorFilters } from '../types';
import { parseErrorFilters, writeErrorFilters } from '../utils';

/** The error list's search, source and route, kept in the URL. */
export function useErrorFilters(): [
	ErrorFilters,
	(patch: Partial<ErrorFilters>) => void,
] {
	const { pathname, search } = useLocation();
	const { safeNavigate } = useSafeNavigate();
	const filters = useMemo(() => parseErrorFilters(search), [search]);
	const update = useCallback(
		(patch: Partial<ErrorFilters>): void =>
			safeNavigate(`${pathname}${writeErrorFilters(search, patch)}`),
		[pathname, safeNavigate, search],
	);
	return [filters, update];
}
