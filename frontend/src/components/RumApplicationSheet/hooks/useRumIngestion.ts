import { getBaseUrl } from 'utils/basePath';
import { useGetOnboardingIngestion } from 'api/generated/services/onboarding';

export type RumIngestionState =
	| { status: 'loading' }
	| { status: 'error'; retry: () => void }
	| { status: 'ready'; endpoint: string; derived: boolean };

export function useRumIngestion(): RumIngestionState {
	const { data, isLoading, isError, refetch } = useGetOnboardingIngestion({
		query: { refetchOnWindowFocus: false, retry: false },
	});
	if (isLoading) {
		return { status: 'loading' };
	}
	if (isError || !data?.data) {
		return {
			status: 'error',
			retry: (): void => {
				void refetch();
			},
		};
	}
	const ingestion = data.data;
	const endpoint = ingestion.rumEndpoint
		?.trim()
		.replace(/\/+$/, '')
		.replace(/\/rum\/v1$/, '');
	return {
		status: 'ready',
		endpoint: endpoint || new URL(getBaseUrl()).origin,
		derived: ingestion.rumDerived !== false || !endpoint,
	};
}
