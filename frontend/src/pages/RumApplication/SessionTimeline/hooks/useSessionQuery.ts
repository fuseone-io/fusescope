import { useGetRUMSession } from 'api/generated/services/rum';
import type { RumtypesGettableSessionDTO } from 'api/generated/services/fuseScope.schemas';
import { ApmWindow } from 'lib/apm/window';
import { isNotFoundError } from 'lib/rum/apiError';

export type SessionState =
	| { status: 'loading' }
	| { status: 'not-found' }
	| { status: 'error' }
	| { status: 'ready'; session: RumtypesGettableSessionDTO };

/** One session in the global time range, across releases. */
export function useSessionQuery(
	applicationId: string,
	sessionId: string,
	window: ApmWindow,
): SessionState {
	const query = useGetRUMSession(
		{ id: applicationId, sessionId: encodeURIComponent(sessionId) },
		{ start: window.start, end: window.end },
		{ query: { retry: false } },
	);
	if (query.isError) {
		return isNotFoundError(query.error)
			? { status: 'not-found' }
			: { status: 'error' };
	}
	return query.data
		? { status: 'ready', session: query.data.data }
		: { status: 'loading' };
}
