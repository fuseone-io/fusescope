import { useMemo } from 'react';
import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import {
	useGetRUMApplication,
	useGetRUMApplicationStatus,
} from 'api/generated/services/rum';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { ApmWindow } from 'lib/apm/window';
import { applicationOverview, overviewRequest } from 'lib/rum/overviewQueries';
import { ApplicationOverview, SessionRequest } from 'lib/rum/overviewTypes';
import { sdkSupport } from 'lib/rum/sdk';
import {
	pickSessionRequests,
	sessionErrorCounts,
	sessionErrorsRequest,
	sessionRequestsRequest,
} from 'lib/rum/sessionRequests';
import { SdkSupport } from 'lib/rum/types';

export interface OverviewState {
	window: ApmWindow;
	application?: RumtypesApplicationDTO;
	applicationLoading: boolean;
	notFound: boolean;
	overview: ApplicationOverview;
	overviewLoading: boolean;
	sessionErrors: Record<string, number>;
	sessionRequests: Record<string, SessionRequest>;
	sdkSupport: SdkSupport;
}

/** The application and its overview in the global time range, for one release or all. */
export function useApplicationOverview(
	applicationId: string,
	release: string,
): OverviewState {
	const window = useApmWindow();
	const app = useGetRUMApplication({ id: applicationId });
	const status = useGetRUMApplicationStatus(
		{ id: applicationId },
		{ query: { refetchOnWindowFocus: false } },
	);

	const request = useMemo(
		() => overviewRequest(window, applicationId, release),
		[window, applicationId, release],
	);
	const response = useApmQueryRange(['rum-overview'], request);
	const overview = useMemo(
		() => applicationOverview(response.data, applicationId),
		[response.data, applicationId],
	);

	const sessionIds = useMemo(
		() => overview.sessions.map((session) => session.id),
		[overview.sessions],
	);
	const errorsRequest = useMemo(
		() =>
			sessionIds.length > 0
				? sessionErrorsRequest(window, applicationId, sessionIds)
				: null,
		[window, applicationId, sessionIds],
	);
	const requestsRequest = useMemo(
		() =>
			sessionIds.length > 0
				? sessionRequestsRequest(window, applicationId, sessionIds)
				: null,
		[window, applicationId, sessionIds],
	);
	const errors = useApmQueryRange(['rum-session-errors'], errorsRequest);
	const requests = useApmQueryRange(['rum-session-requests'], requestsRequest);

	const sessionErrors = useMemo(
		() => sessionErrorCounts(errors.data),
		[errors.data],
	);
	const sessionRequests = useMemo(
		() => pickSessionRequests(requests.data),
		[requests.data],
	);
	const sdk = overview.sdk;
	return {
		window,
		application: app.data?.data,
		applicationLoading: app.isLoading,
		notFound: app.isError,
		overview,
		overviewLoading: response.isLoading,
		sessionErrors,
		sessionRequests,
		sdkSupport: sdk
			? sdkSupport(sdk.name, sdk.version, status.data?.data?.supportedSdks ?? [])
			: 'unknown',
	};
}
