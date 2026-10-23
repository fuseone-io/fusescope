import { useGetRUMView } from 'api/generated/services/rum';
import type { RumtypesGettableViewDTO } from 'api/generated/services/fuseScope.schemas';
import { ApmWindow } from 'lib/apm/window';

import { rangeParams } from '../utils';

export type RouteDetailState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'error' }
	| { status: 'ready'; detail: RumtypesGettableViewDTO };

/** One route's detail; the route is percent-encoded into the path. */
export function useRouteDetail(
	applicationId: string,
	route: string,
	window: ApmWindow,
	release: string,
): RouteDetailState {
	const query = useGetRUMView(
		{ id: applicationId, route: encodeURIComponent(route) },
		rangeParams(window, release),
		{ query: { enabled: Boolean(route) } },
	);
	if (!route) {
		return { status: 'idle' };
	}
	if (query.isError) {
		return { status: 'error' };
	}
	return query.data
		? { status: 'ready', detail: query.data.data }
		: { status: 'loading' };
}
