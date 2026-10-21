import {
	fieldLabel,
	formatCost,
	formatTokenCount,
	formatTokensInOut,
} from '../columnFormat';

describe('fieldLabel', () => {
	it.each([
		['trace_id', 'Trace'],
		['service.name', 'Service'],
		['root_span_name', 'Root span'],
		['estimated_total_cost', 'Est. cost'],
		['trace_duration_nano', 'Duration'],
		['span_count', 'Spans'],
		['total_tokens', 'Tokens'],
		['input_tokens', 'Tokens in / out'],
		['output_tokens', 'Output tokens'],
		['distinct_tool_count', 'Distinct tools'],
		['llm_call_count', 'LLM calls'],
		['tool_call_count', 'Tool calls'],
		['start_time', 'Started'],
		['end_time', 'Ended'],
		['error_count', 'Errors'],
		['input', 'Input'],
		['output', 'Output'],
		['max_llm_duration_nano', 'Slowest LLM call'],
		['last_activity_time', 'Last activity'],
		['timestamp', 'Timestamp'],
		['name', 'Span name'],
		['duration_nano', 'Duration'],
		['http_method', 'HTTP method'],
		['response_status_code', 'Status code'],
		['gen_ai.request.model', 'gen_ai.request.model'],
		['brand_new_aggregate', 'brand_new_aggregate'],
	])('labels %s as %s', (name, label) => {
		expect(fieldLabel(name)).toBe(label);
	});
});

describe('formatTokenCount', () => {
	it.each<[unknown, string]>([
		[0, '0'],
		[820, '820'],
		[999, '999'],
		[1000, '1k'],
		[1940, '1.9k'],
		[21200, '21.2k'],
		[999_949, '999.9k'],
		[1_250_000, '1.25M'],
		['640', '640'],
		[null, '-'],
		[undefined, '-'],
		['', '-'],
		['n/a', '-'],
	])('formats %p as %s', (value, expected) => {
		expect(formatTokenCount(value)).toBe(expected);
	});
});

describe('formatTokensInOut', () => {
	it.each<[unknown, unknown, string | null]>([
		[21200, 3100, '21.2k / 3.1k'],
		[820, 0, '820 / 0'],
		[1900, null, '1.9k / -'],
		[null, 410, '- / 410'],
		[null, null, null],
		['', undefined, null],
	])('formats %p in and %p out as %p', (input, output, expected) => {
		expect(formatTokensInOut(input, output)).toBe(expected);
	});
});

describe('formatCost', () => {
	it.each<[unknown, string | null]>([
		[0, '$0'],
		[0.142, '$0.142'],
		[0.0612, '$0.061'],
		[0.0004, '$0.0004'],
		[0.00123, '$0.0012'],
		[12.4, '$12.40'],
		['0.038', '$0.038'],
		[null, null],
		['', null],
		['abc', null],
	])('formats %p as %p', (value, expected) => {
		expect(formatCost(value)).toBe(expected);
	});
});
