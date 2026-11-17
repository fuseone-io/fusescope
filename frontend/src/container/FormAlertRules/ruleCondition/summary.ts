import {
	defaultCompareOp,
	defaultEvalWindow,
	defaultMatchType,
	defaultSeasonality,
} from 'types/api/alerts/def';

import { EVAL_WINDOW_OPTIONS } from './constants';
import { ConditionSummaryInput, Translate } from './types';

function windowLabel(evalWindow: string | undefined, t: Translate): string {
	const value = evalWindow || defaultEvalWindow;
	const option = EVAL_WINDOW_OPTIONS.find((entry) => entry.value === value);
	return option ? t(option.labelKey) : value;
}

export function conditionSummary(
	input: ConditionSummaryInput,
	t: Translate,
): string {
	const query = input.queryName || t('condition_summary_query_fallback');
	const op = t(`condition_summary_op_${input.op || defaultCompareOp}`);
	const match = t(
		`condition_summary_match_${input.matchType || defaultMatchType}`,
		{ window: windowLabel(input.evalWindow, t) },
	);

	if (input.ruleType === 'anomaly_rule') {
		return t('condition_summary_anomaly', {
			query,
			op,
			match,
			deviations: t('condition_summary_deviation', {
				count: input.target ?? 3,
			}),
			baseline: t(
				`condition_summary_baseline_${input.seasonality || defaultSeasonality}`,
			),
		});
	}

	const hasTarget = typeof input.target === 'number';
	let target = t('condition_summary_target_fallback');
	if (hasTarget) {
		target = input.unitLabel
			? `${input.target} ${input.unitLabel}`
			: String(input.target);
	}
	return t('condition_summary_threshold', { query, op, target, match });
}
