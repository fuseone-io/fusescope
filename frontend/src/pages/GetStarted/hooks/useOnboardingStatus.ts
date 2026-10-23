import { useGetOnboardingStatus } from 'api/generated/services/onboarding';
import type { OnboardingtypesStatusDTO } from 'api/generated/services/fuseScope.schemas';

interface UseOnboardingStatusOptions {
	service?: string;
	/** Unix milliseconds; the server defaults to an hour ago. */
	since?: number;
	refetchInterval: number;
	enabled?: boolean;
}

export interface OnboardingStatusState {
	status: OnboardingtypesStatusDTO | undefined;
	isLoading: boolean;
	isError: boolean;
}

/** Polls /onboarding/status while a user waits for data. */
export function useOnboardingStatus({
	service,
	since,
	refetchInterval,
	enabled = true,
}: UseOnboardingStatusOptions): OnboardingStatusState {
	const { data, isLoading, isError } = useGetOnboardingStatus(
		{ service, since },
		{
			query: {
				enabled,
				refetchInterval,
				refetchIntervalInBackground: false,
				refetchOnWindowFocus: false,
			},
		},
	);

	return { status: data?.data, isLoading, isError };
}
