import { ChannelType } from 'container/CreateAlertChannels/config';

export const CHANNEL_TYPE_OPTIONS: { value: ChannelType; label: string }[] = [
	{ value: ChannelType.Slack, label: 'Slack' },
	{ value: ChannelType.Webhook, label: 'Webhook' },
	{ value: ChannelType.Pagerduty, label: 'Pagerduty' },
	{ value: ChannelType.Opsgenie, label: 'Opsgenie' },
	{ value: ChannelType.Email, label: 'Email' },
	{ value: ChannelType.MsTeams, label: 'Microsoft Teams' },
	{ value: ChannelType.GoogleChat, label: 'Google Chat' },
	{ value: ChannelType.Jira, label: 'Jira' },
	{ value: ChannelType.JsmOps, label: 'Jira Service Management Ops' },
	{ value: ChannelType.IncidentIO, label: 'incident.io' },
];

export function channelTypeLabel(type: string): string {
	return (
		CHANNEL_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
	);
}
