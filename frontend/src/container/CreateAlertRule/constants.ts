import { fuseScopeDocsUrl } from 'constants/docs';
import { AlertTypes } from 'types/api/alerts/alertTypes';

// since we don't have a card in alert creation for anomaly based alert

const SAMPLE_ALERT_GUIDE = fuseScopeDocsUrl('/guides/first-alert/');
const ALERT_RULES_GUIDE = fuseScopeDocsUrl('/alerts/alert-rules/');

export const ALERT_TYPE_URL_MAP: Record<
	AlertTypes,
	{ selection: string; creation: string }
> = {
	[AlertTypes.METRICS_BASED_ALERT]: {
		selection: SAMPLE_ALERT_GUIDE,
		creation: ALERT_RULES_GUIDE,
	},
	[AlertTypes.LOGS_BASED_ALERT]: {
		selection: SAMPLE_ALERT_GUIDE,
		creation: ALERT_RULES_GUIDE,
	},
	[AlertTypes.TRACES_BASED_ALERT]: {
		selection: SAMPLE_ALERT_GUIDE,
		creation: ALERT_RULES_GUIDE,
	},
	[AlertTypes.EXCEPTIONS_BASED_ALERT]: {
		selection: SAMPLE_ALERT_GUIDE,
		creation: ALERT_RULES_GUIDE,
	},
	[AlertTypes.ANOMALY_BASED_ALERT]: {
		selection: ALERT_RULES_GUIDE,
		creation: ALERT_RULES_GUIDE,
	},
};

export const ALERT_TYPE_TO_TITLE: Record<AlertTypes, string> = {
	[AlertTypes.METRICS_BASED_ALERT]: 'metric_based_alert',
	[AlertTypes.LOGS_BASED_ALERT]: 'log_based_alert',
	[AlertTypes.TRACES_BASED_ALERT]: 'traces_based_alert',
	[AlertTypes.EXCEPTIONS_BASED_ALERT]: 'exceptions_based_alert',
	[AlertTypes.ANOMALY_BASED_ALERT]: 'anomaly_based_alert',
};
