import { useMemo } from 'react';
import { LatencyBucket, latencyBuckets } from 'lib/apm/histogram';
import { scalarRows } from 'lib/apm/queryRange';
import { latencyHistogramRequest } from 'lib/apm/serviceRequests';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';

import { useServiceTopLevelOperations } from './useServiceTopLevelOperations';

interface LatencyHistogram {
	buckets: LatencyBucket[];
	isLoading: boolean;
}

/** Requests of the service's top-level operations by latency bucket. */
export function useLatencyHistogram(servicename: string): LatencyHistogram {
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const { operations, isLoading: operationsLoading } =
		useServiceTopLevelOperations(servicename);
	const request = useMemo(
		() =>
			operationsLoading
				? null
				: latencyHistogramRequest({
						window,
						servicename,
						resourceFilter,
						topLevelOperations: operations,
					}),
		[operationsLoading, window, servicename, resourceFilter, operations],
	);
	const { data, isLoading } = useApmQueryRange(
		['service-latency-histogram'],
		request,
	);
	const buckets = useMemo(
		() =>
			latencyBuckets(
				scalarRows(data, 'A').map((row) => ({
					le: row.labels.le,
					count: row.values[0],
				})),
			),
		[data],
	);
	return { buckets, isLoading: isLoading || operationsLoading };
}
