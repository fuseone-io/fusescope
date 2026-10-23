import { useListRUMErrorGroups } from 'api/generated/services/rum';
import { ApmWindow } from 'lib/apm/window';

import { errorListParams } from '../../utils';

/** Sessions in the range, from the error list the tab shares. */
export function useSessionTotal(
	applicationId: string,
	window: ApmWindow,
	release: string,
): number | undefined {
	const query = useListRUMErrorGroups(
		{ id: applicationId },
		errorListParams(window, release),
		{ query: { refetchOnWindowFocus: false } },
	);
	return query.data?.data.sessions;
}
