import { Dispatch, ReactElement, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@signozhq/ui/input';
import { Switch } from '@signozhq/ui/switch';
import { Form, FormInstance, Select } from 'antd';
import type { Store } from 'antd/lib/form/interface';
import AlertsFormTheme from 'components/Alerts/FormSheet/AlertsFormTheme';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import {
	ChannelType,
	EmailChannel,
	GoogleChatChannel,
	IncidentIOChannel,
	JiraChannel,
	JsmOpsChannel,
	OpsgenieChannel,
	PagerChannel,
	SlackChannel,
	WebhookChannel,
} from 'container/CreateAlertChannels/config';

import { CHANNEL_TYPE_OPTIONS, channelTypeLabel } from './channelTypeOptions';
import ChannelFormActions from './components/ChannelFormActions';
import EmailSettings from './Settings/Email';
import GoogleChatSettings from './Settings/GoogleChat';
import IncidentIOSettings from './Settings/IncidentIo';
import JiraSettings from './Settings/Jira';
import JsmOpsSettings from './Settings/JsmOps';
import MsTeamsSettings from './Settings/MsTeams';
import OpsgenieSettings from './Settings/Opsgenie';
import PagerSettings from './Settings/Pager';
import SlackSettings from './Settings/Slack';
import WebhookSettings from './Settings/Webhook';

const PANEL_BODY =
	'tw:px-5 tw:py-4 tw:[--input-border-radius:0.5rem] tw:[--input-height:2.25rem] tw:[&_.ant-form-item-margin-offset]:mb-0! tw:[&_.ant-form-item-with-help]:mb-3! tw:[&>.ant-form-item:last-child]:mb-0!';

function FormAlertChannels({
	formInstance,
	type,
	setSelectedConfig,
	onTypeChangeHandler,
	onTestHandler,
	onSaveHandler,
	savingState,
	testingState,
	initialValue,
	editing = false,
}: FormAlertChannelsProps): JSX.Element {
	const { t } = useTranslation('channels');

	const renderSettings = (): ReactElement | null => {
		switch (type) {
			case ChannelType.Slack:
				return <SlackSettings setSelectedConfig={setSelectedConfig} />;
			case ChannelType.Webhook:
				return <WebhookSettings setSelectedConfig={setSelectedConfig} />;
			case ChannelType.Pagerduty:
				return <PagerSettings setSelectedConfig={setSelectedConfig} />;
			case ChannelType.MsTeams:
				return <MsTeamsSettings setSelectedConfig={setSelectedConfig} />;
			case ChannelType.GoogleChat:
				return <GoogleChatSettings setSelectedConfig={setSelectedConfig} />;
			case ChannelType.Jira:
				return <JiraSettings setSelectedConfig={setSelectedConfig} />;
			case ChannelType.JsmOps:
				return <JsmOpsSettings setSelectedConfig={setSelectedConfig} />;
			case ChannelType.IncidentIO:
				return (
					<IncidentIOSettings
						setSelectedConfig={setSelectedConfig}
						initialMetadata={initialValue?.metadata as Record<string, string>}
					/>
				);
			case ChannelType.Opsgenie:
				return <OpsgenieSettings setSelectedConfig={setSelectedConfig} />;
			case ChannelType.Email:
				return <EmailSettings setSelectedConfig={setSelectedConfig} />;
			default:
				return null;
		}
	};

	const settings = renderSettings();

	return (
		<AlertsFormTheme>
			<Form
				initialValues={initialValue}
				layout="vertical"
				form={formInstance}
				className="tw:flex tw:w-full tw:max-w-3xl tw:flex-1 tw:flex-col tw:gap-4"
			>
				<ContentPanel
					title="Channel"
					testId="alert-channel-form"
					divided
					bodyClassName={PANEL_BODY}
				>
					<Form.Item label={t('field_channel_name')} labelAlign="left" name="name">
						<Input
							data-testid="channel-name-textbox"
							disabled={editing}
							onChange={(event): void => {
								setSelectedConfig((state) => ({
									...state,
									name: event.target.value,
								}));
							}}
						/>
					</Form.Item>

					<Form.Item
						label={t('field_send_resolved')}
						labelAlign="left"
						name="send_resolved"
						getValueProps={(value): { value: boolean } => ({ value: !!value })}
					>
						<Switch
							color="primary"
							textPlacement="right"
							testId="field-send-resolved-checkbox"
							onChange={(value): void => {
								setSelectedConfig((state) => ({
									...state,
									send_resolved: value,
								}));
							}}
						/>
					</Form.Item>

					<Form.Item label={t('field_channel_type')} labelAlign="left" name="type">
						<Select
							disabled={editing}
							onChange={onTypeChangeHandler}
							value={type}
							data-testid="channel-type-select"
						>
							{CHANNEL_TYPE_OPTIONS.map((option) => (
								<Select.Option
									value={option.value}
									key={option.value}
									data-testid="select-option"
								>
									{option.label}
								</Select.Option>
							))}
						</Select>
					</Form.Item>
				</ContentPanel>

				{settings && (
					<ContentPanel
						title={`${channelTypeLabel(type)} settings`}
						testId="channel-settings-panel"
						divided
						bodyClassName={PANEL_BODY}
					>
						{settings}
					</ContentPanel>
				)}
			</Form>
			<ChannelFormActions
				onSave={(): void => onSaveHandler(type)}
				onTest={(): void => onTestHandler(type)}
				savingState={savingState}
				testingState={testingState}
			/>
		</AlertsFormTheme>
	);
}

interface FormAlertChannelsProps {
	formInstance: FormInstance;
	type: ChannelType;
	setSelectedConfig: Dispatch<
		SetStateAction<
			Partial<
				SlackChannel &
					WebhookChannel &
					PagerChannel &
					OpsgenieChannel &
					EmailChannel &
					GoogleChatChannel &
					JiraChannel &
					JsmOpsChannel &
					IncidentIOChannel
			>
		>
	>;
	onTypeChangeHandler: (value: ChannelType) => void;
	onSaveHandler: (props: ChannelType) => void;
	onTestHandler: (props: ChannelType) => void;
	testingState: boolean;
	savingState: boolean;
	initialValue: Store;
	// editing indicates if the form is opened in edit mode
	editing?: boolean;
}

FormAlertChannels.defaultProps = {
	editing: undefined,
};

export default FormAlertChannels;
