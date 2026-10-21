import type { RuletypesRuleDTO } from 'api/generated/services/fuseScope.schemas';

const OPERATOR_SYMBOLS: Record<string, string> = {
	above: '>',
	'1': '>',
	below: '<',
	'2': '<',
	equal: '=',
	'3': '=',
	not_equal: '!=',
	'4': '!=',
	above_or_equal: '>=',
	below_or_equal: '<=',
	outside_bounds: 'outside',
};

const MATCH_TYPE_LABELS: Record<string, string> = {
	at_least_once: 'at least once',
	'1': 'at least once',
	all_the_times: 'all the time',
	'2': 'all the time',
	on_average: 'on average',
	'3': 'on average',
	in_total: 'in total',
	'4': 'in total',
	last: 'last value',
	'5': 'last value',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
	METRIC_BASED_ALERT: 'Metric-based',
	LOGS_BASED_ALERT: 'Log-based',
	TRACES_BASED_ALERT: 'Trace-based',
	EXCEPTIONS_BASED_ALERT: 'Exceptions-based',
	AI_TRACES_BASED_ALERT: 'AI trace-based',
};

/** `5m0s` → `5m`, `1h0m0s` → `1h`. */
function shortDuration(duration: string | undefined): string {
	if (!duration) {
		return '';
	}
	return duration.replace(/(\d+[hm])0s$/, '$1').replace(/(\d+h)0m$/, '$1');
}

/** A rule's data source as the list shows it under the name. */
export function alertTypeLabel(rule: RuletypesRuleDTO): string {
	if (rule.ruleType === 'anomaly_rule') {
		return 'Anomaly-based';
	}
	return ALERT_TYPE_LABELS[rule.alertType] ?? '';
}

/** One line for the rule's first threshold, e.g. `A > 5, at least once in 5m`. */
export function describeRuleCondition(rule: RuletypesRuleDTO): string {
	const { condition } = rule;
	const thresholds = condition?.thresholds?.spec ?? [];
	const first = thresholds[0];
	const op = String(first?.op ?? condition?.op ?? '');
	const target = first ? first.target : condition?.target;
	const matchType = String(first?.matchType ?? condition?.matchType ?? '');

	if (target === undefined || target === null || !OPERATOR_SYMBOLS[op]) {
		return '';
	}

	const query = condition.selectedQueryName
		? `${condition.selectedQueryName} `
		: '';
	const spec = rule.evaluation?.spec;
	const window = shortDuration(
		(spec && 'evalWindow' in spec ? spec.evalWindow : undefined) ??
			rule.evalWindow,
	);
	const match = MATCH_TYPE_LABELS[matchType];
	const when = [match, window && `in ${window}`].filter(Boolean).join(' ');
	const more = thresholds.length > 1 ? ` (+${thresholds.length - 1} more)` : '';

	const suffix = when ? `, ${when}` : '';

	return `${query}${OPERATOR_SYMBOLS[op]} ${target}${suffix}${more}`;
}
