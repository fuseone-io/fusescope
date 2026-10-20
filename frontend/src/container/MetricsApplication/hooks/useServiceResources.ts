import { useMemo } from 'react';
import { ServiceResources, serviceResources } from 'lib/apm/resources';
import { resourcesRequest } from 'lib/apm/serviceRequests';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';

/** The service's hosts, environments and languages, read from its entry spans. */
export function useServiceResources(
	servicename: string,
): ServiceResources & { isLoading: boolean } {
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const request = useMemo(
		() => resourcesRequest({ window, servicename, resourceFilter }),
		[window, servicename, resourceFilter],
	);
	const { data, isLoading } = useApmQueryRange(['service-resources'], request);
	const resources = useMemo(
		() => serviceResources(data, window),
		[data, window],
	);
	return { ...resources, isLoading };
}
