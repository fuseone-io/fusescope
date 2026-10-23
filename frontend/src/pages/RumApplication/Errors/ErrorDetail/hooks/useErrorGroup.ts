import { useGetRUMErrorGroup } from 'api/generated/services/rum';
import type { RumtypesGettableErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';
import { ApmWindow } from 'lib/apm/window';
import { isNotFoundError } from 'lib/rum/apiError';

export type ErrorGroupState =
	| { status: 'loading' }
	| { status: 'not-found' }
	| { status: 'error' }
	| { status: 'ready'; group: RumtypesGettableErrorGroupDTO };

/** One error group in the range, with the selected event's context. */
export function useErrorGroup(
	applicationId: string,
	fingerprint: string,
	window: ApmWindow,
	release: string,
	eventId: string,
): ErrorGroupState {
	const query = useGetRUMErrorGroup(
		{ id: applicationId, fingerprint: encodeURIComponent(fingerprint) },
		{
			start: window.start,
			end: window.end,
			...(release ? { release } : {}),
			...(eventId ? { eventId } : {}),
		},
		{ query: { retry: false, keepPreviousData: true } },
	);
	if (query.isError) {
		return isNotFoundError(query.error)
			? { status: 'not-found' }
			: { status: 'error' };
	}
	return query.data
		? { status: 'ready', group: query.data.data }
		: { status: 'loading' };
}
