export const ALERT_STEP_IDS = {
	QUERY: 'alert-step-query',
	CONDITION: 'alert-step-condition',
	NOTIFICATION: 'alert-step-notification',
} as const;

export const ALERT_STEPS = [
	{ id: ALERT_STEP_IDS.QUERY, label: 'Define the query' },
	{ id: ALERT_STEP_IDS.CONDITION, label: 'Set alert conditions' },
	{ id: ALERT_STEP_IDS.NOTIFICATION, label: 'Notification settings' },
];
