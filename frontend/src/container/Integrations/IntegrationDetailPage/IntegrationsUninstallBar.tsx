import { useState } from 'react';
import { useMutation } from 'react-query';
import { Modal } from 'antd';
import { Typography } from '@signozhq/ui/typography';
import logEvent from 'api/common/logEvent';
import unInstallIntegration from 'api/Integrations/uninstallIntegration';
import { SOMETHING_WENT_WRONG } from 'constants/api';
import { Button } from 'components/ui/button';
import { useNotifications } from 'hooks/useNotifications';
import { X } from 'lucide-react';

import { INTEGRATION_TELEMETRY_EVENTS } from '../constants';
import { ConnectionStates } from './TestConnection';

import './IntegrationDetailPage.styles.scss';

interface IntergrationsUninstallBarProps {
	integrationTitle: string;
	integrationId: string;
	onUnInstallSuccess: () => void;
	connectionStatus: ConnectionStates;
	removeIntegrationTitle?: string;
}
function IntergrationsUninstallBar(
	props: IntergrationsUninstallBarProps,
): JSX.Element {
	const {
		integrationTitle,
		integrationId,
		onUnInstallSuccess,
		connectionStatus,
		removeIntegrationTitle = 'Remove from FuseScope',
	} = props;
	const { notifications } = useNotifications();
	const [isModalOpen, setIsModalOpen] = useState(false);

	const { mutate: uninstallIntegration, isLoading: isUninstallLoading } =
		useMutation(unInstallIntegration, {
			onSuccess: () => {
				onUnInstallSuccess?.();
				setIsModalOpen(false);
			},
			onError: () => {
				notifications.error({
					message: SOMETHING_WENT_WRONG,
				});
			},
		});

	const showModal = (): void => {
		setIsModalOpen(true);
	};

	const handleOk = (): void => {
		logEvent(
			INTEGRATION_TELEMETRY_EVENTS.INTEGRATIONS_DETAIL_REMOVE_INTEGRATION,
			{
				integration: integrationId,
				integrationStatus: connectionStatus,
			},
		);
		uninstallIntegration({
			integration_id: integrationId,
		});
	};

	const handleCancel = (): void => {
		setIsModalOpen(false);
	};
	return (
		<div
			data-testid="uninstall-integration-bar"
			className="uninstall-integration-bar fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4 tw:rounded-xl tw:border tw:border-error-soft tw:bg-surface-raised tw:px-5 tw:py-4 tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
				<h2 className="tw:text-sm tw:font-semibold">Remove Integration</h2>
				<p className="tw:text-[13px] tw:text-muted-foreground">
					Removing the {integrationTitle} integration would make your workspace stop
					listening for data from {integrationTitle} instances.
				</p>
			</div>
			<Button
				variant="destructive"
				className="uninstall-integration-btn tw:dark:bg-destructive!"
				onClick={(): void => showModal()}
			>
				<X aria-hidden="true" />
				{removeIntegrationTitle}
			</Button>
			<Modal
				className="remove-integration-modal"
				open={isModalOpen}
				title="Remove integration"
				onOk={handleOk}
				onCancel={handleCancel}
				okText="Remove Integration"
				okButtonProps={{
					danger: true,
					disabled: isUninstallLoading,
				}}
			>
				<Typography.Text className="remove-integration-text">
					Removing this integration makes FuseScope stop listening for data from{' '}
					{integrationTitle} instances. You would still have to manually remove the
					configuration in your code to stop sending data.
				</Typography.Text>
			</Modal>
		</div>
	);
}

IntergrationsUninstallBar.defaultProps = {
	removeIntegrationTitle: 'Remove from FuseScope',
};

export default IntergrationsUninstallBar;
