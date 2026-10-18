import { useState } from 'react';
import { useMutation } from 'react-query';
import logEvent from 'api/common/logEvent';
import installIntegration from 'api/Integrations/installIntegration';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import { SOMETHING_WENT_WRONG } from 'constants/api';
import { useNotifications } from 'hooks/useNotifications';
import { ArrowLeftRight, Cable } from 'lucide-react';
import { IntegrationConnectionStatus } from 'types/api/integrations/types';

import { INTEGRATION_TELEMETRY_EVENTS } from '../constants';
import ConnectionStatusBadge from './ConnectionStatusBadge';
import { ConnectionStates } from './TestConnection';
import TestConnectionModal from './TestConnectionModal';

interface IntegrationDetailHeaderProps {
	id: string;
	title: string;
	description: string;
	icon: string;
	onUnInstallSuccess: () => void;
	connectionState: ConnectionStates;
	connectionData: IntegrationConnectionStatus;
	setActiveDetailTab: React.Dispatch<React.SetStateAction<string | null>>;
	isLoading: boolean;
}

function IntegrationDetailHeader(
	props: IntegrationDetailHeaderProps,
): JSX.Element {
	const {
		id,
		title,
		icon,
		description,
		connectionState,
		connectionData,
		isLoading,
		onUnInstallSuccess,
		setActiveDetailTab,
	} = props;
	const [isModalOpen, setIsModalOpen] = useState(false);

	const { notifications } = useNotifications();

	const { mutate, isLoading: isInstallLoading } = useMutation(
		installIntegration,
		{
			onSuccess: () => {
				onUnInstallSuccess();
			},
			onError: () => {
				notifications.error({
					message: SOMETHING_WENT_WRONG,
				});
			},
		},
	);

	const isConnectionStateNotInstalled =
		connectionState === ConnectionStates.NotInstalled;

	const handleConnectClick = (): void => {
		if (isConnectionStateNotInstalled) {
			logEvent(INTEGRATION_TELEMETRY_EVENTS.INTEGRATIONS_DETAIL_CONNECT, {
				integration: id,
			});
		} else {
			logEvent(INTEGRATION_TELEMETRY_EVENTS.INTEGRATIONS_DETAIL_TEST_CONNECTION, {
				integration: id,
				connectionStatus: connectionState,
			});
		}
		setIsModalOpen(true);
	};

	return (
		<>
			<PageHeader
				key={id}
				testId="integration-detail-header"
				icon={
					icon ? (
						<img src={icon} alt={title} className="tw:size-7 tw:object-contain" />
					) : (
						<Cable />
					)
				}
				title={
					isLoading ? <Skeleton className="tw:h-7 tw:w-48 tw:bg-muted" /> : title
				}
				badges={
					!isLoading &&
					!isConnectionStateNotInstalled && (
						<ConnectionStatusBadge connectionState={connectionState} />
					)
				}
				description={isLoading ? undefined : description}
				actions={
					<Button
						variant={isConnectionStateNotInstalled ? 'default' : 'outline'}
						className={
							isConnectionStateNotInstalled
								? undefined
								: 'tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!'
						}
						disabled={isInstallLoading || isLoading}
						onClick={handleConnectClick}
					>
						<ArrowLeftRight aria-hidden="true" />
						<span className="translate-safe">
							{isConnectionStateNotInstalled ? `Connect ${title}` : `Test Connection`}
						</span>
					</Button>
				}
			/>

			<TestConnectionModal
				open={isModalOpen}
				title={title}
				connectionState={connectionState}
				connectionData={connectionData}
				onClose={(): void => setIsModalOpen(false)}
				onInstall={(): void => mutate({ integration_id: id, config: {} })}
				onShowConfiguration={(): void => setActiveDetailTab('configuration')}
			/>
		</>
	);
}

export default IntegrationDetailHeader;
