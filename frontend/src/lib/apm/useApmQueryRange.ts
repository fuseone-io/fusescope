import { QueryKey, useQuery, UseQueryResult } from 'react-query';
import { queryRangeV5 } from 'api/generated/services/querier';
import type { Querybuildertypesv5QueryRangeRequestDTO } from 'api/generated/services/fuseScope.schemas';
import { QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import { RangeResponse } from './queryRange';

export const APM_QUERY_RANGE_KEY = 'apm-query-range';

/** A v5 query_range request through react-query; `null` waits for its inputs. */
export function useApmQueryRange(
	key: QueryKey,
	request: QueryRangeRequestV5 | null,
): UseQueryResult<RangeResponse> {
	return useQuery<RangeResponse>({
		queryKey: [APM_QUERY_RANGE_KEY, key, request],
		queryFn: async ({ signal }) => {
			// The generated DTO models enums the hand-written v5 types keep as strings.
			const response = await queryRangeV5(
				request as unknown as Querybuildertypesv5QueryRangeRequestDTO,
				signal,
			);
			return response.data as RangeResponse;
		},
		enabled: request !== null,
		keepPreviousData: true,
		refetchOnWindowFocus: false,
	});
}
