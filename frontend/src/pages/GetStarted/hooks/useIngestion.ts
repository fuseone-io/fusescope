import { useGetOnboardingIngestion } from 'api/generated/services/onboarding';
import type { OnboardingtypesIngestionDTO } from 'api/generated/services/fuseScope.schemas';

export interface IngestionState {
	ingestion: OnboardingtypesIngestionDTO | undefined;
	isLoading: boolean;
	isError: boolean;
}

export function useIngestion(): IngestionState {
	const { data, isLoading, isError } = useGetOnboardingIngestion({
		query: { refetchOnWindowFocus: false },
	});

	return { ingestion: data?.data, isLoading, isError };
}
