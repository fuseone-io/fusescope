export const EVAL_WINDOW_OPTIONS = [
	{ value: '5m0s', labelKey: 'option_5min' },
	{ value: '10m0s', labelKey: 'option_10min' },
	{ value: '15m0s', labelKey: 'option_15min' },
	{ value: '1h0m0s', labelKey: 'option_60min' },
	{ value: '4h0m0s', labelKey: 'option_4hours' },
	{ value: '24h0m0s', labelKey: 'option_24hours' },
];

export const PROM_EVAL_WINDOW_OPTIONS = EVAL_WINDOW_OPTIONS.slice(0, 3);

export const SEASONALITY_OPTIONS = [
	{ value: 'hourly', label: 'Hourly' },
	{ value: 'daily', label: 'Daily' },
	{ value: 'weekly', label: 'Weekly' },
];

export const DEVIATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

/** Ops 5 and 6 are reserved for above-or-equal and below-or-equal. */
export const ANOMALY_OPS = ['1', '2', '7'];
export const THRESHOLD_OPS = ['1', '2', '3', '4'];

export const OP_LABEL_KEYS: Record<string, string> = {
	'1': 'option_above',
	'2': 'option_below',
	'3': 'option_equal',
	'4': 'option_notequal',
	'7': 'option_above_below',
};

export const ANOMALY_MATCH_TYPES = ['1', '2'];
export const THRESHOLD_MATCH_TYPES = ['1', '2', '3', '4', '5'];

export const MATCH_TYPE_LABEL_KEYS: Record<string, string> = {
	'1': 'option_atleastonce',
	'2': 'option_allthetimes',
	'3': 'option_onaverage',
	'4': 'option_intotal',
	'5': 'option_last',
};
