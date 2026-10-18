import { Dispatch, ReactElement, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@signozhq/ui/input';
import { Switch } from '@signozhq/ui/switch';
import { Form, FormInstance, Select } from 'antd';
import type { Store } from 'antd/lib/form/interface';
import Panel from 'components/PageTemplate/components/Panel';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
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
import history from 'lib/history';
import { Loader2 } from 'lucide-react';

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

function FormAlertChannels({
	formInstance,
	type,
	setSelectedConfig,
	onTypeChangeHandler,
	onTestHandler,
	onSaveHandler,
	savingState,
	testingState,
	title,
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

	return (
		<Panel
			title={title}
			testId="alert-channel-form"
			bodyClassName="tw:px-5 tw:pt-4"
		>
			<Form
				initialValues={initialValue}
				layout="vertical"
				form={formInstance}
				className="tw:max-w-3xl"
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
						<Select.Option value="slack" key="slack" data-testid="select-option">
							Slack
						</Select.Option>
						<Select.Option value="webhook" key="webhook" data-testid="select-option">
							Webhook
						</Select.Option>
						<Select.Option
							value="pagerduty"
							key="pagerduty"
							data-testid="select-option"
						>
							Pagerduty
						</Select.Option>
						<Select.Option
							value="opsgenie"
							key="opsgenie"
							data-testid="select-option"
						>
							Opsgenie
						</Select.Option>
						<Select.Option value="email" key="email" data-testid="select-option">
							Email
						</Select.Option>

						<Select.Option value="msteams" key="msteams" data-testid="select-option">
							Microsoft Teams
						</Select.Option>

						<Select.Option
							value="googlechat"
							key="googlechat"
							data-testid="select-option"
						>
							Google Chat
						</Select.Option>

						<Select.Option value="jira" key="jira" data-testid="select-option">
							Jira
						</Select.Option>

						<Select.Option value="jsmops" key="jsmops" data-testid="select-option">
							Jira Service Management Ops
						</Select.Option>

						<Select.Option
							value="incidentio"
							key="incidentio"
							data-testid="select-option"
						>
							incident.io
						</Select.Option>
					</Select>
				</Form.Item>

				<Form.Item>{renderSettings()}</Form.Item>
			</Form>
			<div className="fs-ui tw:-mx-5 tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3 tw:font-sans">
				<Button
					data-testid="save-channel-button"
					disabled={savingState}
					aria-busy={savingState}
					onClick={(): void => onSaveHandler(type)}
				>
					{savingState && <Loader2 aria-hidden="true" className="tw:animate-spin" />}
					{t('button_save_channel')}
				</Button>
				<Button
					variant="outline"
					data-testid="test-channel-button"
					disabled={testingState}
					aria-busy={testingState}
					onClick={(): void => onTestHandler(type)}
				>
					{testingState && (
						<Loader2 aria-hidden="true" className="tw:animate-spin" />
					)}
					{t('button_test_channel')}
				</Button>
				<Button
					variant="ghost"
					data-testid="return-button"
					onClick={(): void => {
						history.replace(ROUTES.ALL_CHANNELS);
					}}
				>
					{t('button_return')}
				</Button>
			</div>
		</Panel>
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
	title: string;
	initialValue: Store;
	// editing indicates if the form is opened in edit mode
	editing?: boolean;
}

FormAlertChannels.defaultProps = {
	editing: undefined,
};

export default FormAlertChannels;
