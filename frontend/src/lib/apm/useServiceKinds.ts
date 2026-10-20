import { useCallback, useMemo } from 'react';

import { getServiceKind, ServiceKind, ServiceKindInfo } from './serviceKind';
import { serviceSignals, serviceSignalsRequest } from './serviceSignals';
import { useApmQueryRange } from './useApmQueryRange';
import { useApmWindow } from './useApmWindow';
import { useResourceFilterExpression } from './useResourceFilterExpression';

export interface ServiceIdentity {
	kind: ServiceKind;
	language?: string;
}

/**
 * Each service's type and SDK language, from one request shared by the list,
 * the service header and the dependencies.
 */
export function useServiceKinds(): (
	name: string,
	extra?: Partial<ServiceKindInfo>,
) => ServiceIdentity {
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const request = useMemo(
		() => serviceSignalsRequest(window, resourceFilter),
		[window, resourceFilter],
	);
	const { data } = useApmQueryRange(['service-kinds'], request);
	const signals = useMemo(() => serviceSignals(data), [data]);
	return useCallback(
		(name: string, extra: Partial<ServiceKindInfo> = {}): ServiceIdentity => {
			const { language, ...info } = signals[name] ?? {};
			return { kind: getServiceKind({ ...info, ...extra, name }), language };
		},
		[signals],
	);
}
