import { useCallback } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { externalApisPath } from 'container/MetricsApplication/Tabs/util';
import { Dependency } from 'lib/apm/dependencies';
import { serviceUrl } from 'pages/Services/components/ServicesList/utils';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

/** Where a dependency row leads: that service's page, or External APIs for an address. */
export function useDependencyLink(
	servicename: string,
): (dependency: Dependency) => string {
	const { search } = useLocation();
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	return useCallback(
		(dependency: Dependency): string =>
			dependency.kind === 'External'
				? externalApisPath({
						servicename,
						domainName: dependency.name,
						isError: false,
						startTime: Math.floor(minTime / 1e9),
						endTime: Math.floor(maxTime / 1e9),
					})
				: serviceUrl(dependency.name, search),
		[servicename, search, minTime, maxTime],
	);
}
