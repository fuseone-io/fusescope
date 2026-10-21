import {
	TelemetrytypesFieldContextDTO,
	TelemetrytypesSignalDTO,
} from 'api/generated/services/fuseScope.schemas';
import { rest } from 'msw';
import type { QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import { fieldKeysResponse } from '@/storybook/msw/__story_mockdata__/fields';
import { queryRangeV5RawResponse } from '@/storybook/msw/__story_mockdata__/queryRange';

/** The per-trace aggregates the AI keys endpoint reports in the trace context. */
const AGGREGATES = [
	'estimated_total_cost',
	'total_tokens',
	'input_tokens',
	'output_tokens',
	'llm_call_count',
	'tool_call_count',
	'distinct_tool_count',
	'max_llm_duration_nano',
];

interface TraceSeed {
	service: string;
	root: string;
	cost: number;
	durationMs: number;
	spans: number;
	input: number;
	output: number;
	llm: number;
	tools: number;
	errors: number;
}

const SEEDS: TraceSeed[] = [
	{
		service: 'support-agent',
		root: 'invoke_agent support-triage',
		cost: 0.142,
		durationMs: 18400,
		spans: 46,
		input: 21200,
		output: 3100,
		llm: 9,
		tools: 14,
		errors: 1,
	},
	{
		service: 'support-agent',
		root: 'invoke_agent support-triage',
		cost: 0.061,
		durationMs: 7900,
		spans: 22,
		input: 9400,
		output: 1200,
		llm: 4,
		tools: 6,
		errors: 0,
	},
	{
		service: 'search-api',
		root: 'POST /search',
		cost: 0.0004,
		durationMs: 420,
		spans: 5,
		input: 820,
		output: 0,
		llm: 1,
		tools: 0,
		errors: 0,
	},
	{
		service: 'support-agent',
		root: 'invoke_agent support-triage',
		cost: 0.038,
		durationMs: 5200,
		spans: 17,
		input: 6100,
		output: 640,
		llm: 3,
		tools: 4,
		errors: 0,
	},
	{
		service: 'support-agent',
		root: 'chat gpt-4o-mini',
		cost: 0.0012,
		durationMs: 1100,
		spans: 3,
		input: 1900,
		output: 410,
		llm: 1,
		tools: 0,
		errors: 0,
	},
	{
		service: 'support-agent',
		root: 'invoke_agent support-triage',
		cost: 0.097,
		durationMs: 12700,
		spans: 35,
		input: 14800,
		output: 2200,
		llm: 6,
		tools: 11,
		errors: 2,
	},
];

const MS_TO_NS = 1_000_000;

const aiTraceRows = (
	end: number,
): Array<{ timestamp: string; data: Record<string, unknown> }> =>
	SEEDS.map((seed, index) => {
		const finished = end - index * 37_000;
		const started = finished - seed.durationMs;
		const timestamp = new Date(started).toISOString();
		return {
			timestamp,
			data: {
				trace_id: `4bf92f3577b34da6a3ce929d0e0e47${String(index).padStart(2, '0')}`,
				'service.name': seed.service,
				root_span_name: seed.root,
				estimated_total_cost: seed.cost,
				trace_duration_nano: seed.durationMs * MS_TO_NS,
				span_count: seed.spans,
				total_tokens: seed.input + seed.output,
				input_tokens: seed.input,
				output_tokens: seed.output,
				llm_call_count: seed.llm,
				tool_call_count: seed.tools,
				distinct_tool_count: Math.min(seed.tools, 3),
				error_count: seed.errors,
				start_time: timestamp,
				end_time: new Date(finished).toISOString(),
				last_activity_time: new Date(finished).toISOString(),
				max_llm_duration_nano: Math.round(seed.durationMs * 0.4) * MS_TO_NS,
				input: 'Where is order 4417?',
				output: 'Order 4417 shipped yesterday.',
			},
		};
	});

/**
 * The Trace view over real AI aggregates: cost, tokens in and out, LLM and
 * tool calls. Other request types fall through to the page's own handlers.
 */
export const aiTraceHandlers = [
	rest.get(
		'http://localhost/api/v1/ai_observability/fields/keys',
		(_req, res, ctx) =>
			res(
				ctx.status(200),
				ctx.json(
					fieldKeysResponse(AGGREGATES, {
						signal: TelemetrytypesSignalDTO.traces,
						fieldContext: TelemetrytypesFieldContextDTO.trace,
					}),
				),
			),
	),
	rest.post('http://localhost/api/v5/query_range', async (req, res, ctx) => {
		const body = (await req.json()) as QueryRangeRequestV5;
		if (body.requestType !== 'trace') {
			return undefined;
		}
		return res(
			ctx.status(200),
			ctx.json(queryRangeV5RawResponse(aiTraceRows(body.end), { type: 'trace' })),
		);
	}),
];
