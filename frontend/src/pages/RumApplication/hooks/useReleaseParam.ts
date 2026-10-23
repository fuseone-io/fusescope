import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from 'hooks/useSafeNavigate';

import { RELEASE_PARAM } from '../constants';

/** The release filter, kept in `?release=` so every tab shares it. */
export function useReleaseParam(): [string, (release: string) => void] {
	const { pathname, search } = useLocation();
	const { safeNavigate } = useSafeNavigate();
	const release = new URLSearchParams(search).get(RELEASE_PARAM) ?? '';

	const setRelease = useCallback(
		(next: string): void => {
			const params = new URLSearchParams(search);
			if (next) {
				params.set(RELEASE_PARAM, next);
			} else {
				params.delete(RELEASE_PARAM);
			}
			params.delete('page');
			const query = params.toString();
			safeNavigate(query ? `${pathname}?${query}` : pathname);
		},
		[pathname, safeNavigate, search],
	);

	return [release, setRelease];
}
