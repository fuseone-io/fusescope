import { useQuery, UseQueryResult } from 'react-query';
import { getIntegration } from 'api/Integrations/getIntegration';
import { AxiosError, AxiosResponse } from 'axios';
import {
	GetIntegrationPayloadProps,
	GetIntegrationProps,
} from 'types/api/integrations/types';

export const getIntegrationQueryKey = (integrationId: string): string[] => [
	'Integration',
	integrationId,
];

export const useGetIntegration = ({
	integrationId,
}: GetIntegrationPayloadProps): UseQueryResult<
	AxiosResponse<GetIntegrationProps>,
	AxiosError
> =>
	useQuery<AxiosResponse<GetIntegrationProps>, AxiosError>({
		queryKey: getIntegrationQueryKey(integrationId),
		queryFn: () => getIntegration({ integrationId }),
	});
