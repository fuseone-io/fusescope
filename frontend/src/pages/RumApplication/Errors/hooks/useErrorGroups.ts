import { useMemo } from 'react';
import {
	useListRUMErrorGroups,
	useListRUMSourceMaps,
} from 'api/generated/services/rum';
import type { RumtypesErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';
import { ApmWindow } from 'lib/apm/window';

import { errorListParams } from '../utils';

export type ErrorGroupsState =
	| { status: 'loading' }
	| { status: 'error' }
	| {
			status: 'ready';
			groups: RumtypesErrorGroupDTO[];
			/** Groups in the range, beyond the ones fetched. */
			total: number;
			/** Sessions in the range, for each group's share. */
			sessions: number;
	  };

export interface ErrorGroups {
	state: ErrorGroupsState;
	/** Releases with uploaded source maps; undefined until known. */
	uploadedReleases?: Set<string>;
}

/** The top error groups of the range, and which releases have source maps. */
export function useErrorGroups(
	applicationId: string,
	window: ApmWindow,
	release: string,
): ErrorGroups {
	const query = useListRUMErrorGroups(
		{ id: applicationId },
		errorListParams(window, release),
		{ query: { keepPreviousData: true } },
	);
	const sourceMaps = useListRUMSourceMaps({ id: applicationId }, undefined, {
		query: { refetchOnWindowFocus: false },
	});
	const releases = sourceMaps.data?.data.releases;
	const uploadedReleases = useMemo(
		() => (releases ? new Set(releases.map((item) => item.release)) : undefined),
		[releases],
	);

	let state: ErrorGroupsState = { status: 'loading' };
	if (query.isError) {
		state = { status: 'error' };
	} else if (query.data) {
		const { data } = query.data;
		state = {
			status: 'ready',
			groups: data.groups ?? [],
			total: data.total,
			sessions: data.sessions,
		};
	}
	return { state, uploadedReleases };
}
