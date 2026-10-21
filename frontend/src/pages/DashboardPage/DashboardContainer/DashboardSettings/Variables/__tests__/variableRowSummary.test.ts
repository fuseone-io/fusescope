import { DashboardtypesDynamicVariableSignalDTO } from 'api/generated/services/fuseScope.schemas';

import {
	cachedOptionsFromDynamicResponse,
	cachedOptionsFromQueryResponse,
	summarizeVariable,
} from '../utils/variableRowSummary';
import {
	emptyVariableFormModel,
	VARIABLE_SORT,
	type VariableFormModel,
} from '../variableFormModel';

const model = (overrides: Partial<VariableFormModel>): VariableFormModel => ({
	...emptyVariableFormModel(),
	name: 'v',
	...overrides,
});

describe('summarizeVariable', () => {
	it.each<{
		name: string;
		variable: VariableFormModel;
		options?: string[];
		expected: ReturnType<typeof summarizeVariable>;
	}>([
		{
			name: 'dynamic with cached options',
			variable: model({
				type: 'DYNAMIC',
				dynamicAttribute: 'service.name',
				dynamicSignal: DashboardtypesDynamicVariableSignalDTO.traces,
			}),
			options: ['cart', 'checkout', 'frontend', 'payment', 'route', 'mysql'],
			expected: {
				source: 'service.name from Traces',
				values: ['cart', 'checkout', 'frontend', 'payment'],
				moreCount: 2,
			},
		},
		{
			name: 'dynamic without a field or cached options',
			variable: model({ type: 'DYNAMIC' }),
			expected: { source: 'No field selected', values: [], moreCount: 0 },
		},
		{
			name: 'query on one line',
			variable: model({
				type: 'QUERY',
				queryValue: 'SELECT DISTINCT a\n  FROM t\n WHERE env = $env',
			}),
			options: ['x'],
			expected: {
				source: 'SELECT DISTINCT a FROM t WHERE env = $env',
				values: ['x'],
				moreCount: 0,
			},
		},
		{
			name: 'query without text',
			variable: model({ type: 'QUERY' }),
			expected: { source: 'No query', values: [], moreCount: 0 },
		},
		{
			name: 'custom parsed in its sort order',
			variable: model({
				type: 'CUSTOM',
				customValue: 'b,a,c',
				sort: VARIABLE_SORT.ASC,
			}),
			expected: {
				source: 'Custom list · 3 values',
				values: ['a', 'b', 'c'],
				moreCount: 0,
			},
		},
		{
			name: 'custom with one value',
			variable: model({ type: 'CUSTOM', customValue: 'only' }),
			expected: {
				source: 'Custom list · 1 value',
				values: ['only'],
				moreCount: 0,
			},
		},
		{
			name: 'textbox with a default',
			variable: model({ type: 'TEXT', textValue: '/api/checkout' }),
			expected: { source: 'Default: /api/checkout', values: [], moreCount: 0 },
		},
		{
			name: 'textbox without a default',
			variable: model({ type: 'TEXT' }),
			expected: { source: 'No default value', values: [], moreCount: 0 },
		},
	])('$name', ({ variable, options, expected }) => {
		expect(summarizeVariable(variable, options)).toStrictEqual(expected);
	});
});

describe('cached option extraction', () => {
	it.each([
		[undefined, undefined],
		[{ statusCode: 500, payload: null }, undefined],
		[
			{ statusCode: 200, payload: { variableValues: [3, 1, 2] } },
			['1', '2', '3'],
		],
	])('query response %#', (data, expected) => {
		expect(
			cachedOptionsFromQueryResponse(data, VARIABLE_SORT.NUMERICAL_ASC),
		).toStrictEqual(expected);
	});

	it.each([
		[undefined, undefined],
		[{ data: { normalizedValues: ['b', 'a'] } }, ['a', 'b']],
		[{ data: { values: { StringValues: ['z', 'y'] } } }, ['y', 'z']],
	])('dynamic response %#', (data, expected) => {
		expect(
			cachedOptionsFromDynamicResponse(data, VARIABLE_SORT.ASC),
		).toStrictEqual(expected);
	});
});
