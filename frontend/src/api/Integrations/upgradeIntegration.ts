import axios from 'api';
import { AxiosResponse } from 'axios';
import {
	InstalledIntegrationsSuccessResponse,
	UpgradeIntegrationProps,
} from 'types/api/integrations/types';

export const upgradeIntegration = (
	props: UpgradeIntegrationProps,
): Promise<AxiosResponse<InstalledIntegrationsSuccessResponse>> =>
	axios.post('/integrations/upgrade', props);
