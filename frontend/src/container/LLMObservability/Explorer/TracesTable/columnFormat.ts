/** The trace-view column whose cell shows input and output tokens together. */
export const TOKENS_IN_OUT_FIELD = 'input_tokens';
export const OUTPUT_TOKENS_FIELD = 'output_tokens';
export const COST_FIELD = 'estimated_total_cost';

const EMPTY = '-';

const FIELD_LABELS: Record<string, string> = {
	trace_id: 'Trace',
	traceID: 'Trace',
	'service.name': 'Service',
	root_span_name: 'Root span',
	[COST_FIELD]: 'Est. cost',
	trace_duration_nano: 'Duration',
	span_count: 'Spans',
	total_tokens: 'Tokens',
	[TOKENS_IN_OUT_FIELD]: 'Tokens in / out',
	[OUTPUT_TOKENS_FIELD]: 'Output tokens',
	distinct_tool_count: 'Distinct tools',
	llm_call_count: 'LLM calls',
	tool_call_count: 'Tool calls',
	start_time: 'Started',
	end_time: 'Ended',
	error_count: 'Errors',
	input: 'Input',
	output: 'Output',
	max_llm_duration_nano: 'Slowest LLM call',
	last_activity_time: 'Last activity',
	timestamp: 'Timestamp',
	name: 'Span name',
	duration_nano: 'Duration',
	http_method: 'HTTP method',
	response_status_code: 'Status code',
};

/** A column header for a field; fields without a label keep their key. */
export function fieldLabel(name: string): string {
	return FIELD_LABELS[name] ?? name;
}

function toNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) ? number : null;
}

const trimZeros = (text: string): string =>
	text.includes('.') ? text.replace(/\.?0+$/, '') : text;

export function formatTokenCount(value: unknown): string {
	const count = toNumber(value);
	if (count === null) {
		return EMPTY;
	}
	if (count >= 1_000_000) {
		return `${trimZeros((count / 1_000_000).toFixed(2))}M`;
	}
	if (count >= 1000) {
		return `${trimZeros((Math.floor(count / 100) / 10).toFixed(1))}k`;
	}
	return String(count);
}

/** "21.2k / 3.1k"; null when neither side is known. */
export function formatTokensInOut(
	input: unknown,
	output: unknown,
): string | null {
	if (toNumber(input) === null && toNumber(output) === null) {
		return null;
	}
	return `${formatTokenCount(input)} / ${formatTokenCount(output)}`;
}

/** USD with enough digits to tell sub-cent traces apart; null when unknown. */
export function formatCost(value: unknown): string | null {
	const cost = toNumber(value);
	if (cost === null) {
		return null;
	}
	if (cost === 0) {
		return '$0';
	}
	if (cost >= 1) {
		return `$${cost.toFixed(2)}`;
	}
	if (cost >= 0.01) {
		return `$${trimZeros(cost.toFixed(3))}`;
	}
	return `$${Number(cost.toPrecision(2))}`;
}
