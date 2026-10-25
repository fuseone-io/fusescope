import { useState } from 'react';
import { Redirect, useParams } from 'react-router-dom';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import HeaderBandTabsLayout from 'components/PageTemplate/components/HeaderBandTabsLayout';
import { Skeleton } from 'components/ui/skeleton';
import ROUTES from 'constants/routes';
import { useGetIntegration } from 'hooks/Integrations/useGetIntegration';
import { useGetIntegrationStatus } from 'hooks/Integrations/useGetIntegrationStatus';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { defaultTo } from 'lodash-es';
import { useAppContext } from 'providers/App/App';

import CloudIntegration from '../CloudIntegration/CloudIntegration';
import IntegrationsError from '../components/IntegrationsError';
import { INTEGRATION_TYPES } from '../constants';
import { IntegrationType } from '../types';
import { availableUpdate, handleContactSupport } from '../utils';
import IntegrationDetailHeader from './IntegrationDetailHeader';
import IntergrationsUninstallBar from './IntegrationsUninstallBar';
import { integrationDetailTabs } from './integrationDetailTabs';
import { ConnectionStates } from './TestConnection';
import { getConnectionStatesFromConnectionStatus } from './utils';

const cloudIntegrationTypeById: Record<string, IntegrationType> = {
	[INTEGRATION_TYPES.AWS]: IntegrationType.AWS_SERVICES,
	[INTEGRATION_TYPES.AZURE]: IntegrationType.AZURE_SERVICES,
	[INTEGRATION_TYPES.GCP]: IntegrationType.GCP_SERVICES,
};

const NO_CONNECTION_DATA = { logs: null, metrics: null };

function IntegrationDetailPage(): JSX.Element {
	const { integrationId = '' } = useParams<{ integrationId?: string }>();
	const [activeDetailTab, setActiveDetailTab] = useState<string>('overview');

	const { data, isLoading, isFetching, refetch, isRefetching, isError } =
		useGetIntegration({ integrationId });

	const { isCloudUser: isCloudUserVal, isEnterpriseSelfHostedUser } =
		useGetTenantLicense();
	const { isFetchingActiveLicense } = useAppContext();

	const { data: integrationStatus, isLoading: isStatusLoading } =
		useGetIntegrationStatus({ integrationId });

	const loading = isLoading || isFetching || isRefetching || isStatusLoading;
	const integrationData = data?.data.data;
	const title = defaultTo(integrationData?.title, '');

	const connectionStatus = getConnectionStatesFromConnectionStatus(
		integrationData?.installation,
		defaultTo(
			integrationStatus?.data.data,
			defaultTo(integrationData?.connection_status, NO_CONNECTION_DATA),
		),
	);

	if (cloudIntegrationTypeById[integrationId]) {
		if (
			!isFetchingActiveLicense &&
			!isCloudUserVal &&
			!isEnterpriseSelfHostedUser
		) {
			return <Redirect to={ROUTES.INTEGRATIONS} />;
		}
		return <CloudIntegration type={cloudIntegrationTypeById[integrationId]} />;
	}

	const header = (
		<IntegrationDetailHeader
			id={integrationId}
			title={title}
			description={defaultTo(integrationData?.description, '')}
			icon={defaultTo(integrationData?.icon, '')}
			installedVersion={
				integrationData?.installation ? integrationData.version : undefined
			}
			update={availableUpdate(
				Boolean(integrationData?.installation),
				integrationData?.version,
				integrationData?.latest_version,
			)}
			connectionState={connectionStatus}
			connectionData={defaultTo(integrationStatus?.data.data, NO_CONNECTION_DATA)}
			onUnInstallSuccess={refetch}
			onShowConfiguration={(): void => setActiveDetailTab('configuration')}
			isLoading={loading}
		/>
	);

	if (isError) {
		return (
			<HeaderBandLayout
				testId="integration-details-page"
				header={header}
				bodyClassName="tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6"
			>
				<IntegrationsError
					testId="integration-details-error"
					onRetry={(): void => {
						void refetch();
					}}
					onContactSupport={(): void => handleContactSupport(isCloudUserVal)}
				/>
			</HeaderBandLayout>
		);
	}

	const tabs = integrationDetailTabs({
		integrationData,
		integrationId,
		placeholder: loading && (
			<Skeleton
				data-testid="integration-details-loading"
				className="tw:h-80 tw:w-full tw:rounded-xl tw:bg-muted"
			/>
		),
		footer: connectionStatus !== ConnectionStates.NotInstalled && (
			<IntergrationsUninstallBar
				integrationTitle={title}
				integrationId={integrationId}
				onUnInstallSuccess={refetch}
				connectionStatus={connectionStatus}
			/>
		),
	});

	return (
		<HeaderBandTabsLayout
			testId="integration-details-page"
			header={header}
			label="Integration details"
			tabs={tabs}
			value={activeDetailTab}
			onValueChange={setActiveDetailTab}
		/>
	);
}

export default IntegrationDetailPage;
