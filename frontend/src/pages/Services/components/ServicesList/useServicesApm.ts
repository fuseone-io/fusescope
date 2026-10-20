import { useMemo } from 'react';
import {
	ServiceApm,
	servicesListRequests,
	servicesListStats,
} from 'lib/apm/servicesList';
import { ApmSource } from 'lib/apm/types';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';

interface ServicesApm {
	stats: Record<string, ServiceApm>;
	isLoading: boolean;
}

/** Previous-period totals and sparklines for every service, in two requests. */
export function useServicesApm(
	source: ApmSource,
	topLevelOperations: [string, string[]][] = [],
): ServicesApm {
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const waitsForOperations =
		source === 'span-metrics' && topLevelOperations.length === 0;

	const requests = useMemo(
		() =>
			waitsForOperations
				? null
				: servicesListRequests({
						source,
						window,
						resourceFilter,
						topLevelOperations,
					}),
		[waitsForOperations, source, window, resourceFilter, topLevelOperations],
	);

	const totals = useApmQueryRange(['services-totals'], requests?.totals ?? null);
	const series = useApmQueryRange(['services-series'], requests?.series ?? null);

	const stats = useMemo(
		() => servicesListStats(source, window, totals.data, series.data),
		[source, window, totals.data, series.data],
	);

	return { stats, isLoading: totals.isLoading };
}
