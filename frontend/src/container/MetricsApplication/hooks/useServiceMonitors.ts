import { useMemo } from 'react';
import { useListRules } from 'api/generated/services/rules';
import type { RuletypesRuleDTO } from 'api/generated/services/fuseScope.schemas';
import { serviceMonitors } from 'lib/apm/monitors';

interface ServiceMonitors {
	rules: RuletypesRuleDTO[];
	isLoading: boolean;
	isError: boolean;
}

/** Alert rules scoped to the service, from the alert list's request. */
export function useServiceMonitors(servicename: string): ServiceMonitors {
	const { data, isLoading, isError } = useListRules();
	const rules = useMemo(
		() => serviceMonitors(data?.data ?? [], servicename),
		[data, servicename],
	);
	return { rules, isLoading, isError };
}
