import { useMemo } from 'react';
import { useListRUMViews } from 'api/generated/services/rum';
import { ApmWindow } from 'lib/apm/window';

import { ROUTES_LIMIT } from '../constants';
import { ViewRow } from '../types';
import { rangeParams, toViewRows } from '../utils';

export type ViewsState =
	| { status: 'loading' }
	| { status: 'error' }
	| { status: 'ready'; rows: ViewRow[] };

export function useViewsQuery(
	applicationId: string,
	window: ApmWindow,
	release: string,
): ViewsState {
	const query = useListRUMViews(
		{ id: applicationId },
		{ ...rangeParams(window, release), limit: ROUTES_LIMIT },
	);
	const routes = query.data?.data.routes;
	const rows = useMemo(() => toViewRows(routes), [routes]);
	if (query.isError) {
		return { status: 'error' };
	}
	return query.data ? { status: 'ready', rows } : { status: 'loading' };
}
