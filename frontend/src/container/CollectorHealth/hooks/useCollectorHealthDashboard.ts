import { useCallback, useMemo } from 'react';
import { useQueryClient } from 'react-query';

import {
	getGetDashboardV2QueryKey,
	useGetSystemDashboard,
} from 'api/generated/services/dashboard';
import type { GetSystemDashboardQueryError } from 'api/generated/services/dashboard';
import type {
	DashboardtypesGettableDashboardV2DTO,
	GetDashboardV2200,
} from 'api/generated/services/fuseScope.schemas';

export const SYSTEM_DASHBOARD_NAME = 'fusescope-collector';

// The API never exposes a system dashboard's id; panels look the dashboard
// up by this one in the query cache.
const DASHBOARD_ID = 'fusescope-collector-health';

export interface UseCollectorHealthDashboardResult {
	dashboard: DashboardtypesGettableDashboardV2DTO | undefined;
	isLoading: boolean;
	isError: boolean;
	error: GetSystemDashboardQueryError | null;
	refetch: () => void;
}

export function useCollectorHealthDashboard(): UseCollectorHealthDashboardResult {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error, refetch } = useGetSystemDashboard(
		{ name: SYSTEM_DASHBOARD_NAME },
		{ query: { staleTime: Infinity, refetchOnMount: false } },
	);

	const dashboard = useMemo(
		() =>
			data
				? ({
						...data.data,
						id: DASHBOARD_ID,
					} as DashboardtypesGettableDashboardV2DTO)
				: undefined,
		[data],
	);

	if (dashboard) {
		queryClient.setQueryData<GetDashboardV2200>(
			getGetDashboardV2QueryKey({ id: DASHBOARD_ID }),
			{ data: dashboard, status: 'success' },
		);
	}

	const refetchDashboard = useCallback((): void => {
		void refetch();
	}, [refetch]);

	return { dashboard, isLoading, isError, error, refetch: refetchDashboard };
}
