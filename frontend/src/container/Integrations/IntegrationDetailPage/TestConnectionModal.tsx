import { Button, Modal, Tooltip } from 'antd';
import { Typography } from '@signozhq/ui/typography';
import ConfigureIcon from 'assets/Integrations/ConfigureIcon';
import cx from 'classnames';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import dayjs from 'dayjs';
import { Check } from '@signozhq/icons';
import { IntegrationConnectionStatus } from 'types/api/integrations/types';

import TestConnection, { ConnectionStates } from './TestConnection';
import { getLatestReceivedData } from './utils';

import './IntegrationDetailPage.styles.scss';

interface TestConnectionModalProps {
	open: boolean;
	title: string;
	connectionState: ConnectionStates;
	connectionData: IntegrationConnectionStatus;
	onClose: () => void;
	onInstall: () => void;
	onShowConfiguration: () => void;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function TestConnectionModal({
	open,
	title,
	connectionState,
	connectionData,
	onClose,
	onInstall,
	onShowConfiguration,
}: TestConnectionModalProps): JSX.Element {
	const latestData = getLatestReceivedData(connectionData);
	const lastReceivedAt = latestData.last_received_ts_ms
		? dayjs(latestData.last_received_ts_ms).format(
				DATE_TIME_FORMATS.MONTH_DATETIME_SHORT,
			)
		: '';

	const isConnectionStatePending =
		connectionState === ConnectionStates.NotInstalled ||
		connectionState === ConnectionStates.TestingConnection;

	const isConnectionStateNotInstalled =
		connectionState === ConnectionStates.NotInstalled;

	return (
		<Modal
			className="test-connection-modal"
			open={open}
			title={
				isConnectionStateNotInstalled
					? `Connect ${title}`
					: `Test ${title} Connection`
			}
			onCancel={onClose}
			footer={
				<div
					className={cx(
						'connection-footer',
						!isConnectionStatePending && 'not-pending',
					)}
				>
					<Button
						type="text"
						icon={
							isConnectionStateNotInstalled ? <ConfigureIcon /> : <Check size={14} />
						}
						onClick={(): void => {
							if (isConnectionStateNotInstalled) {
								onShowConfiguration();
							}
							onClose();
						}}
						className="understandBtn"
					>
						{isConnectionStatePending
							? isConnectionStateNotInstalled
								? 'Show Configuration Steps'
								: 'I have already configured'
							: 'I understand'}
					</Button>
					{isConnectionStatePending && (
						<Button
							type="primary"
							icon={
								isConnectionStateNotInstalled ? <Check size={14} /> : <ConfigureIcon />
							}
							onClick={(): void => {
								if (isConnectionStateNotInstalled) {
									onInstall();
								} else {
									onShowConfiguration();
								}

								onClose();
							}}
							className="configureBtn"
						>
							{isConnectionStateNotInstalled
								? 'I have already configured'
								: 'Show Configuration Steps'}
						</Button>
					)}
				</div>
			}
		>
			<div className="connection-content">
				{!isConnectionStateNotInstalled && (
					<TestConnection connectionState={connectionState} />
				)}
				{connectionState === ConnectionStates.Connected ||
				connectionState === ConnectionStates.NoDataSinceLong ? (
					<>
						<div className="data-info">
							<Typography.Text className="last-data">
								Last recieved from
							</Typography.Text>
							<div className="connection-line" />
							<Tooltip
								title={latestData.last_received_from}
								key={latestData.last_received_from}
								placement="right"
							>
								<Typography.Text className="last-value" truncate={1}>
									{latestData.last_received_from}
								</Typography.Text>
							</Tooltip>
						</div>
						<div className="data-info">
							<Typography.Text className="last-data">Last recieved at</Typography.Text>
							<div className="connection-line" />
							<Tooltip title={lastReceivedAt} key={lastReceivedAt} placement="right">
								<Typography.Text className="last-value" truncate={1}>
									{lastReceivedAt}
								</Typography.Text>
							</Tooltip>
						</div>
					</>
				) : connectionState === ConnectionStates.TestingConnection ? (
					<div className="data-test-connection">
						<div className="last-data">
							We have not received data from your {title} Instance yet. You need to
							manually configure your {title} instance to start sending data to
							FuseScope.
						</div>
						<div className="last-data">
							If you have already configured your resources to send data, sit tight and
							wait for the data to flow in, Or else, see the steps to configure your
							resources to start sending data.
						</div>
					</div>
				) : isConnectionStateNotInstalled ? (
					<div className="data-test-connection">
						<div className="last-data">
							You would need to manually configure your {title} instance to start
							sending data to FuseScope.
						</div>
						<div className="last-data">
							If you have already configured your resources to send data, sit tight and
							wait for the data to flow in, Or else, see the steps to configure your
							resources to start sending data.
						</div>
					</div>
				) : null}
			</div>
		</Modal>
	);
}

export default TestConnectionModal;
