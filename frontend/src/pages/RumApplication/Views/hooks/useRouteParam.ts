import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from 'hooks/useSafeNavigate';

import { ROUTE_PARAM } from '../constants';

/** The route whose detail sheet is open, kept in `?route=`. */
export function useRouteParam(): [string, (route: string) => void] {
	const { pathname, search } = useLocation();
	const { safeNavigate } = useSafeNavigate();
	const route = new URLSearchParams(search).get(ROUTE_PARAM) ?? '';
	const setRoute = useCallback(
		(next: string): void => {
			const params = new URLSearchParams(search);
			if (next) {
				params.set(ROUTE_PARAM, next);
			} else {
				params.delete(ROUTE_PARAM);
			}
			const query = params.toString();
			safeNavigate(query ? `${pathname}?${query}` : pathname);
		},
		[pathname, safeNavigate, search],
	);
	return [route, setRoute];
}
