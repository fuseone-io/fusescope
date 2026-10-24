import { initialQueryAIWithType } from 'constants/queryBuilder';
import { Query, TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';

import {
	clearQueryFilters,
	quickFilterLabel,
	quickFilterSummary,
} from '../quickFilterBarUtils';

const item = (
	key: string,
	op: string,
	value: TagFilterItem['value'],
): TagFilterItem => ({
	id: `${key}-${op}`,
	key: { key, dataType: undefined, type: '' } as TagFilterItem['key'],
	op,
	value,
});

describe('quickFilterSummary', () => {
	it.each<[string, TagFilterItem[], string]>([
		['no clause', [], 'All'],
		['a clause on another key', [item('service.name', 'in', ['a'])], 'All'],
		[
			'values kept with IN',
			[item('gen_ai.request.model', 'in', ['gpt-4o', 'o3'])],
			'2 selected',
		],
		[
			'one value kept with =',
			[item('gen_ai.request.model', '=', 'gpt-4o')],
			'1 selected',
		],
		[
			'values dropped with NOT IN',
			[item('gen_ai.request.model', 'not in', ['gpt-4o'])],
			'1 excluded',
		],
		[
			'a value dropped with !=',
			[item('attribute.gen_ai.request.model', '!=', 'o3')],
			'1 excluded',
		],
		[
			'a context-prefixed key',
			[item('attribute.gen_ai.request.model', 'IN', ['a', 'b', 'c'])],
			'3 selected',
		],
	])('reads %s', (_name, items, expected) => {
		expect(quickFilterSummary(items, 'gen_ai.request.model')).toBe(expected);
	});
});

describe('quickFilterSummary for a range filter', () => {
	it.each<[string, TagFilterItem[], string]>([
		['no clause', [], 'All'],
		[
			'a min and a max',
			[item('duration_nano', '>=', 100), item('duration_nano', '<=', 900)],
			'Filtered',
		],
	])('reads %s', (_name, items, expected) => {
		expect(quickFilterSummary(items, 'duration_nano', 'range')).toBe(expected);
	});
});

describe('quickFilterLabel', () => {
	it.each([
		['gen_ai.request.model', 'Gen Ai Request Model', 'Model'],
		['gen_ai.provider.name', 'Gen Ai Provider Name', 'Provider'],
		['gen_ai.operation.name', 'Gen Ai Operation Name', 'Operation'],
		['gen_ai.agent.name', 'Gen Ai Agent Name', 'Agent'],
		['gen_ai.tool.name', 'Gen Ai Tool Name', 'Tool'],
		['service.name', 'Service Name', 'Service'],
		['deployment.environment', 'Deployment Environment', 'Environment (legacy)'],
		['deployment.environment.name', 'Deployment Environment Name', 'Environment'],
		['http.method', 'Http Method', 'Http Method'],
	])('labels %s', (key, title, expected) => {
		expect(quickFilterLabel(key, title)).toBe(expected);
	});
});

describe('clearQueryFilters', () => {
	const withFilters = (index: number): Query => ({
		...initialQueryAIWithType,
		builder: {
			...initialQueryAIWithType.builder,
			queryData: [0, 1].map((position) => ({
				...initialQueryAIWithType.builder.queryData[0],
				queryName: String.fromCharCode(65 + position),
				filter: { expression: `service.name = 'q${position}'` },
				filters: {
					items: [item('service.name', '=', `q${position}`)],
					op: position === index ? 'OR' : 'AND',
				},
			})),
		},
	});

	it('empties the filters of the query at the index', () => {
		const cleared = clearQueryFilters(withFilters(1), 1);
		const [first, second] = cleared.builder.queryData;

		expect(second.filter?.expression).toBe('');
		expect(second.filters).toStrictEqual({ items: [], op: 'OR' });
		expect(first.filter?.expression).toBe("service.name = 'q0'");
		expect(first.filters?.items).toHaveLength(1);
	});

	it('defaults the operator to AND', () => {
		const query = withFilters(0);
		const queryData = query.builder.queryData.map((entry) => ({
			...entry,
			filters: undefined,
		}));
		const cleared = clearQueryFilters(
			{ ...query, builder: { ...query.builder, queryData } } as Query,
			0,
		);

		expect(cleared.builder.queryData[0].filters).toStrictEqual({
			items: [],
			op: 'AND',
		});
	});

	it('returns the query untouched when the index has no query', () => {
		const query = withFilters(0);
		expect(clearQueryFilters(query, 5)).toBe(query);
	});
});
