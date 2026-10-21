import { useMemo } from 'react';
import {
	serviceKpiRequest,
	ServiceKpis,
	serviceKpis,
} from 'lib/apm/serviceKpis';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmSource } from 'lib/apm/useApmSource';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';

import { useApdexThreshold } from './useApdexThreshold';
import { useServiceTopLevelOperations } from './useServiceTopLevelOperations';

interface ServiceKpiState extends ServiceKpis {
	isLoading: boolean;
}

/**
 * The service's totals for this and the previous period, from span metrics or
 * traces like the charts (`use_span_metrics`). Waits for the top-level
 * operations, which scope span metrics and the Apdex.
 */
export function useServiceKpis(servicename: string): ServiceKpiState {
	const source = useApmSource();
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const apdexThreshold = useApdexThreshold(servicename);
	const { operations, isLoading: operationsLoading } =
		useServiceTopLevelOperations(servicename);
	const waits = operationsLoading;

	const request = useMemo(
		() =>
			waits
				? null
				: serviceKpiRequest({
						source,
						window,
						servicename,
						resourceFilter,
						topLevelOperations: operations,
						apdexThreshold,
					}),
		[
			waits,
			source,
			window,
			servicename,
			resourceFilter,
			operations,
			apdexThreshold,
		],
	);
	const { data, isLoading } = useApmQueryRange(['service-kpis'], request);
	const kpis = useMemo(
		() => serviceKpis(source, window, data, apdexThreshold),
		[source, window, data, apdexThreshold],
	);
	return { ...kpis, isLoading: isLoading || waits };
}
