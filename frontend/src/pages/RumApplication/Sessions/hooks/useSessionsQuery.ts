import { useListRUMSessions } from 'api/generated/services/rum';
import type { RumtypesSessionSummaryDTO } from 'api/generated/services/fuseScope.schemas';
import { ApmWindow } from 'lib/apm/window';

import { SessionFilters } from '../types';
import { sessionListParams } from '../utils';

export type SessionsState =
	| { status: 'loading' }
	| { status: 'error' }
	| { status: 'ready'; sessions: RumtypesSessionSummaryDTO[]; total: number };

export function useSessionsQuery(
	applicationId: string,
	filters: SessionFilters,
	window: ApmWindow,
	release: string,
): SessionsState {
	const query = useListRUMSessions(
		{ id: applicationId },
		sessionListParams(filters, window, release),
		{ query: { keepPreviousData: true } },
	);
	if (query.isError) {
		return { status: 'error' };
	}
	if (!query.data) {
		return { status: 'loading' };
	}
	return {
		status: 'ready',
		sessions: query.data.data.sessions ?? [],
		total: query.data.data.total,
	};
}
