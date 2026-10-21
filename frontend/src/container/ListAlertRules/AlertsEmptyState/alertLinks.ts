import { fuseScopeDocsUrl } from 'constants/docs';
import { DataSource } from 'types/common/queryBuilder';

export const ALERT_INFO_LINKS = [
	{
		infoText: 'How to create Metrics-based alerts',
		link: fuseScopeDocsUrl('/alerts/alert-rules/'),
		leftIconVisible: false,
		rightIconVisible: true,
		dataSource: DataSource.METRICS,
	},
	{
		infoText: 'How to create Log-based alerts',
		link: fuseScopeDocsUrl('/alerts/alert-rules/'),
		leftIconVisible: false,
		rightIconVisible: true,
		dataSource: DataSource.LOGS,
	},
	{
		infoText: 'How to create Trace-based alerts',
		link: fuseScopeDocsUrl('/alerts/alert-rules/'),
		leftIconVisible: false,
		rightIconVisible: true,
		dataSource: DataSource.TRACES,
	},
];

export const ALERT_CARDS = [
	{
		header: 'Alert on high memory usage',
		subheader: "Monitor your host's memory usage",
		dataSource: DataSource.METRICS,
		link: fuseScopeDocsUrl('/guides/first-alert/'),
	},
	{
		header: 'Alert on slow external API calls',
		subheader: 'Monitor your external API calls',
		dataSource: DataSource.TRACES,
		link: fuseScopeDocsUrl('/guides/first-alert/'),
	},
	{
		header: 'Alert on high percentage of timeout errors in logs',
		subheader: 'Monitor your logs for errors',
		dataSource: DataSource.LOGS,
		link: fuseScopeDocsUrl('/guides/first-alert/'),
	},
	{
		header: 'Alert on high error percentage of an endpoint',
		subheader: 'Monitor your API endpoint',
		dataSource: DataSource.METRICS,
		link: fuseScopeDocsUrl('/guides/first-alert/'),
	},
];
