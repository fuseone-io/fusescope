import { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { IntegrationsProps } from 'types/api/integrations/types';

import { INTEGRATION_TELEMETRY_EVENTS } from './constants';
import IntegrationsHeader from './IntegrationsHeader/IntegrationsHeader';
import IntegrationsList from './IntegrationsList/IntegrationsList';
import OneClickIntegrations from './OneClickIntegrations/OneClickIntegrations';

function Integrations(): JSX.Element {
	const history = useHistory();
	const [searchQuery, setSearchQuery] = useState('');
	const { isCloudUser, isEnterpriseSelfHostedUser } = useGetTenantLicense();

	const setSelectedIntegration = useCallback(
		(integration: IntegrationsProps | null) => {
			if (integration) {
				logEvent(INTEGRATION_TELEMETRY_EVENTS.INTEGRATIONS_ITEM_LIST_CLICKED, {
					integration,
				});
				history.push(`${ROUTES.INTEGRATIONS}/${integration.id}`);
			} else {
				history.push(ROUTES.INTEGRATIONS);
			}
		},
		[history],
	);

	useEffect(() => {
		logEvent(INTEGRATION_TELEMETRY_EVENTS.INTEGRATIONS_LIST_VISITED, {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<PageTemplate testId="integrations-page">
			<IntegrationsHeader
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
			/>
			{(isCloudUser || isEnterpriseSelfHostedUser) && (
				<OneClickIntegrations
					searchQuery={searchQuery}
					setSelectedIntegration={setSelectedIntegration}
				/>
			)}
			<IntegrationsList
				searchQuery={searchQuery}
				setSelectedIntegration={setSelectedIntegration}
			/>
		</PageTemplate>
	);
}

export default Integrations;
