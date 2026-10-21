import { useMemo } from 'react';
import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { getQueryRangeV5 } from 'api/v5/queryRange/getQueryRange';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { NANO_SECOND_MULTIPLIER } from 'store/globalTime';
import { AppState } from 'store/reducers';
import { QueryRangePayloadV5, ScalarData } from 'types/api/v5/queryRange';
import { GlobalReducer } from 'types/reducer/globalTime';

import { callersByDomain } from '../../../domainList';
import { SPAN_ATTRIBUTES } from '../DomainDetails/constants';

const CALLERS_LIMIT = 500;

function callersPayload(
	start: number,
	end: number,
	filterExpression: string,
): QueryRangePayloadV5 {
	const base = `${SPAN_ATTRIBUTES.HTTP_URL} EXISTS AND kind_string = 'Client'`;
	const expression = filterExpression.trim()
		? `(${base}) AND (${filterExpression})`
		: base;
	return {
		schemaVersion: 'v1',
		start,
		end,
		requestType: 'scalar',
		compositeQuery: {
			queries: [
				{
					type: 'builder_query',
					spec: {
						name: 'A',
						signal: 'traces',
						disabled: false,
						aggregations: [{ expression: 'count()' }],
						filter: { expression },
						groupBy: [
							{
								name: SPAN_ATTRIBUTES.SERVER_NAME,
								fieldDataType: 'string',
								fieldContext: 'span',
							},
							{
								name: 'service.name',
								fieldDataType: 'string',
								fieldContext: 'resource',
							},
						],
						limit: CALLERS_LIMIT,
					},
				},
			],
		},
		formatOptions: { formatTableResultForUI: true, fillGaps: false },
		variables: {},
	};
}

/** The services whose client spans call each domain, busiest first. */
export function useDomainCallers(
	filterExpression: string,
): Map<string, string[]> {
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const payload = useMemo(
		() =>
			callersPayload(
				Math.floor(minTime / NANO_SECOND_MULTIPLIER),
				Math.floor(maxTime / NANO_SECOND_MULTIPLIER),
				filterExpression,
			),
		[minTime, maxTime, filterExpression],
	);

	const { data } = useQuery({
		queryKey: [REACT_QUERY_KEY.GET_DOMAIN_CALLERS, payload],
		queryFn: ({ signal }) => getQueryRangeV5(payload, ENTITY_VERSION_V5, signal),
	});

	return useMemo(
		() =>
			callersByDomain(
				data?.data?.data?.data?.results?.[0] as ScalarData | undefined,
			),
		[data],
	);
}
