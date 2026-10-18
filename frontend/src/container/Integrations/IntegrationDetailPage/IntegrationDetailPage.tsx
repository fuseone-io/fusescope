import { useState } from 'react';
import { useParams } from 'react-router-dom';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import { Skeleton } from 'components/ui/skeleton';
import { useGetIntegration } from 'hooks/Integrations/useGetIntegration';
import { useGetIntegrationStatus } from 'hooks/Integrations/useGetIntegrationStatus';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { defaultTo } from 'lodash-es';

import CloudIntegration from '../CloudIntegration/CloudIntegration';
import BackToIntegrations from '../components/BackToIntegrations';
import IntegrationsError from '../components/IntegrationsError';
import { IntegrationType } from '../types';
import { INTEGRATION_TYPES } from '../constants';
import { handleContactSupport } from '../utils';
import IntegrationDetailContent from './IntegrationDetailContent';
import IntegrationDetailHeader from './IntegrationDetailHeader';
import IntergrationsUninstallBar from './IntegrationsUninstallBar';
import { ConnectionStates } from './TestConnection';
import { getConnectionStatesFromConnectionStatus } from './utils';

const cloudIntegrationTypeById: Record<string, IntegrationType> = {
	[INTEGRATION_TYPES.AWS]: IntegrationType.AWS_SERVICES,
	[INTEGRATION_TYPES.AZURE]: IntegrationType.AZURE_SERVICES,
	[INTEGRATION_TYPES.GCP]: IntegrationType.GCP_SERVICES,
};

function IntegrationDetailPage(): JSX.Element {
	const { integrationId } = useParams<{ integrationId?: string }>();
	const [activeDetailTab, setActiveDetailTab] = useState<string | null>(
		'overview',
	);

	const { data, isLoading, isFetching, refetch, isRefetching, isError } =
		useGetIntegration({
			integrationId: integrationId || '',
		});

	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	const { data: integrationStatus, isLoading: isStatusLoading } =
		useGetIntegrationStatus({
			integrationId: integrationId || '',
		});

	const loading = isLoading || isFetching || isRefetching || isStatusLoading;
	const integrationData = data?.data.data;

	const connectionStatus = getConnectionStatesFromConnectionStatus(
		integrationData?.installation,
		defaultTo(
			integrationStatus?.data.data,
			defaultTo(integrationData?.connection_status, { logs: null, metrics: null }),
		),
	);

	if (integrationId && cloudIntegrationTypeById[integrationId]) {
		return <CloudIntegration type={cloudIntegrationTypeById[integrationId]} />;
	}

	return (
		<PageTemplate testId="integration-details-page">
			<BackToIntegrations />

			{isError && (
				<IntegrationsError
					testId="integration-details-error"
					onRetry={(): void => {
						void refetch();
					}}
					onContactSupport={(): void => handleContactSupport(isCloudUserVal)}
				/>
			)}

			{!isError && (
				<>
					<IntegrationDetailHeader
						id={integrationId || ''}
						title={defaultTo(integrationData?.title, '')}
						description={defaultTo(integrationData?.description, '')}
						icon={defaultTo(integrationData?.icon, '')}
						connectionState={connectionStatus}
						connectionData={defaultTo(integrationStatus?.data.data, {
							logs: null,
							metrics: null,
						})}
						onUnInstallSuccess={refetch}
						setActiveDetailTab={setActiveDetailTab}
						isLoading={loading}
					/>

					{loading && (
						<Skeleton
							data-testid="integration-details-loading"
							className="tw:h-80 tw:w-full tw:rounded-lg tw:bg-muted"
						/>
					)}

					{!loading && integrationData && (
						<IntegrationDetailContent
							activeDetailTab={activeDetailTab || 'overview'}
							integrationData={integrationData}
							integrationId={integrationId || ''}
							setActiveDetailTab={setActiveDetailTab}
						/>
					)}

					{!loading && connectionStatus !== ConnectionStates.NotInstalled && (
						<IntergrationsUninstallBar
							integrationTitle={defaultTo(integrationData?.title, '')}
							integrationId={integrationId || ''}
							onUnInstallSuccess={refetch}
							connectionStatus={connectionStatus}
						/>
					)}
				</>
			)}
		</PageTemplate>
	);
}

export default IntegrationDetailPage;
