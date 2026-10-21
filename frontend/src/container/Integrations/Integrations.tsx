import { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { Plug } from 'lucide-react';
import { IntegrationsProps } from 'types/api/integrations/types';

import { INTEGRATION_TELEMETRY_EVENTS } from './constants';
import DataSourcesButton from './IntegrationsHeader/DataSourcesButton';
import IntegrationsCountMeta from './IntegrationsHeader/IntegrationsCountMeta';
import IntegrationsSearch from './IntegrationsHeader/IntegrationsSearch';
import RequestIntegrationButton from './IntegrationsHeader/RequestIntegrationButton';
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
		<HeaderBandLayout
			testId="integrations-page"
			header={
				<CompactPageHeader
					icon={<Plug />}
					title="Integrations"
					meta={<IntegrationsCountMeta />}
					actions={
						<>
							<RequestIntegrationButton />
							<DataSourcesButton />
						</>
					}
				/>
			}
			bodyClassName="tw:mx-auto tw:w-full tw:max-w-[1600px] tw:gap-5 tw:px-4 tw:pt-5 tw:pb-10 tw:md:px-6"
		>
			<IntegrationsSearch value={searchQuery} onChange={setSearchQuery} />
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
		</HeaderBandLayout>
	);
}

export default Integrations;
