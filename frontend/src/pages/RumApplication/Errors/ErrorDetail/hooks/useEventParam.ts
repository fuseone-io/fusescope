import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from 'hooks/useSafeNavigate';

import { EVENT_PARAM } from '../../constants';

/** The selected event of the group, kept in `?event=`; empty for the latest. */
export function useEventParam(): [string, (eventId: string) => void] {
	const { pathname, search } = useLocation();
	const { safeNavigate } = useSafeNavigate();
	const eventId = new URLSearchParams(search).get(EVENT_PARAM) ?? '';
	const setEventId = useCallback(
		(next: string): void => {
			const params = new URLSearchParams(search);
			if (next) {
				params.set(EVENT_PARAM, next);
			} else {
				params.delete(EVENT_PARAM);
			}
			const query = params.toString();
			safeNavigate(query ? `${pathname}?${query}` : pathname);
		},
		[pathname, safeNavigate, search],
	);
	return [eventId, setEventId];
}
