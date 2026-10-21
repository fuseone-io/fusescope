import { useMemo } from 'react';
import {
	ServiceApm,
	servicesListRequests,
	servicesListStats,
} from 'lib/apm/servicesList';
import { ApmSource } from 'lib/apm/types';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { apmWindow } from 'lib/apm/window';

const NO_OPERATIONS: [string, string[]][] = [];

/**
 * Previous-period totals of every service over the widget's own interval, for
 * the deltas and highlights; Home draws no sparklines, so one request.
 */
export function useHomeServicesApm(
	source: ApmSource,
	startTimeMs: number,
	endTimeMs: number,
	topLevelOperations: [string, string[]][] = NO_OPERATIONS,
): Record<string, ServiceApm> {
	const window = useMemo(
		() => apmWindow(startTimeMs * 1e6, endTimeMs * 1e6),
		[startTimeMs, endTimeMs],
	);
	const waitsForOperations =
		source === 'span-metrics' && topLevelOperations.length === 0;

	const request = useMemo(
		() =>
			waitsForOperations
				? null
				: servicesListRequests({
						source,
						window,
						resourceFilter: '',
						topLevelOperations,
					}).totals,
		[waitsForOperations, source, window, topLevelOperations],
	);

	const { data } = useApmQueryRange(['home-services-totals'], request);

	return useMemo(
		() => servicesListStats(source, window, data, undefined),
		[source, window, data],
	);
}
