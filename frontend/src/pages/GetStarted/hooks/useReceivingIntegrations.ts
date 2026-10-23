import { useQueries } from 'react-query';
import { getIntegrationStatus } from 'api/Integrations/getIntegrationStatus';
import { useGetAllIntegrations } from 'hooks/Integrations/useGetAllIntegrations';

import { isRecentlyReceiving } from '../utils';

const POLL_MS = 30_000;

/** Ids of installed built-in integrations that sent data in the last day. */
export function useReceivingIntegrations(ids: string[]): Set<string> {
	const { data } = useGetAllIntegrations();
	const installed = new Set(
		(data?.data?.data?.integrations ?? [])
			.filter((integration) => integration.is_installed)
			.map((integration) => integration.id),
	);
	const watched = ids.filter((id) => installed.has(id));

	const results = useQueries(
		watched.map((integrationId) => ({
			queryKey: ['integration-connection-status', integrationId],
			queryFn: (): ReturnType<typeof getIntegrationStatus> =>
				getIntegrationStatus({ integrationId }),
			refetchInterval: POLL_MS,
		})),
	);

	return new Set(
		watched.filter((_, index) =>
			isRecentlyReceiving(results[index]?.data?.data?.data, Date.now()),
		),
	);
}
