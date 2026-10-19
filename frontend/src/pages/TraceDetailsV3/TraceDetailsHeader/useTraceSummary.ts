import { useGetTraceSummary } from 'api/generated/services/tracedetail';
import type { SpantypesGettableTraceSummaryDTO } from 'api/generated/services/fuseScope.schemas';

interface UseTraceSummaryResult {
	data: SpantypesGettableTraceSummaryDTO | undefined;
	isLoading: boolean;
	isError: boolean;
}

export function useTraceSummary(traceId: string): UseTraceSummaryResult {
	const { data, isLoading, isError } = useGetTraceSummary(
		{ traceID: traceId },
		{ query: { enabled: !!traceId, keepPreviousData: true } },
	);

	return { data: data?.data, isLoading, isError };
}
