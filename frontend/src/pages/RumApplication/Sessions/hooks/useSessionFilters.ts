import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from 'hooks/useSafeNavigate';

import { SessionFilters } from '../types';
import { parseSessionFilters, writeSessionFilters } from '../utils';

/** The session list's filters and page, kept in the URL. */
export function useSessionFilters(): [
	SessionFilters,
	(patch: Partial<SessionFilters>) => void,
] {
	const { pathname, search } = useLocation();
	const { safeNavigate } = useSafeNavigate();
	const filters = useMemo(() => parseSessionFilters(search), [search]);
	const update = useCallback(
		(patch: Partial<SessionFilters>): void =>
			safeNavigate(`${pathname}${writeSessionFilters(search, patch)}`),
		[pathname, safeNavigate, search],
	);
	return [filters, update];
}
