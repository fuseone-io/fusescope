import { useMemo } from 'react';
import {
	useGetRUMApplicationStatus,
	useListRUMApplications,
} from 'api/generated/services/rum';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmWindow } from 'lib/apm/useApmWindow';
import {
	applicationsMetrics,
	applicationsRequests,
} from 'lib/rum/applicationsQueries';
import { sdkSupport } from 'lib/rum/sdk';

import { ApplicationRow } from '../types';

export type ApplicationsListState =
	| { status: 'loading' }
	| { status: 'error' }
	| { status: 'ready'; rows: ApplicationRow[]; metricsLoading: boolean };

/** The applications with their query-side metrics in the global time range. */
export function useApplicationsList(): ApplicationsListState {
	const window = useApmWindow();
	const list = useListRUMApplications();
	const applications = useMemo(() => list.data?.data ?? [], [list.data]);
	const ids = useMemo(() => applications.map((app) => app.id), [applications]);

	const requests = useMemo(
		() => (ids.length > 0 ? applicationsRequests(window, ids) : null),
		[window, ids],
	);
	const totals = useApmQueryRange(
		['rum-applications-totals'],
		requests?.totals ?? null,
	);
	const series = useApmQueryRange(
		['rum-applications-series'],
		requests?.series ?? null,
	);
	// Every application's status lists the same server-wide supported SDKs.
	const status = useGetRUMApplicationStatus(
		{ id: ids[0] ?? '' },
		{ query: { enabled: ids.length > 0, refetchOnWindowFocus: false } },
	);
	const supported = useMemo(
		() => status.data?.data?.supportedSdks ?? [],
		[status.data],
	);

	const rows = useMemo(() => {
		const metrics = applicationsMetrics(ids, totals.data, series.data);
		return applications.map((application): ApplicationRow => {
			const sdk = metrics[application.id]?.sdk;
			return {
				application,
				metrics: metrics[application.id],
				support: sdk ? sdkSupport(sdk.name, sdk.version, supported) : 'unknown',
			};
		});
	}, [applications, ids, totals.data, series.data, supported]);

	if (list.isLoading) {
		return { status: 'loading' };
	}
	if (list.isError) {
		return { status: 'error' };
	}
	return { status: 'ready', rows, metricsLoading: totals.isLoading };
}
