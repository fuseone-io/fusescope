import { initialQueriesMap } from 'constants/queryBuilder';
import { Query } from 'types/api/queryBuilder/queryBuilderData';

import { selectedFilterValue, withFilterValue } from '../filterSelect';

const SERVICE = 'service.name';
const ENVIRONMENT = 'deployment.environment';

const queryWith = (expression: string, items: unknown[] = []): Query => {
	const base = initialQueriesMap.traces;
	return {
		...base,
		builder: {
			...base.builder,
			queryData: [
				{
					...base.builder.queryData[0],
					filter: { expression },
					filters: { op: 'AND', items: items as never[] },
				},
			],
		},
	};
};

const expressionOf = (query: Query): string =>
	query.builder.queryData[0].filter?.expression ?? '';

describe('withFilterValue', () => {
	it('adds the value to an empty query', () => {
		const next = withFilterValue(queryWith(''), SERVICE, 'payment');

		expect(expressionOf(next)).toMatch(/service\.name\s+IN\s+\[?'payment'\]?/i);
		expect(selectedFilterValue(next, SERVICE)).toBe('payment');
	});

	it('replaces the previous value and keeps the other clauses', () => {
		const first = withFilterValue(
			queryWith("http.method = 'GET'"),
			SERVICE,
			'payment',
		);
		const next = withFilterValue(first, SERVICE, 'frontend');

		expect(selectedFilterValue(next, SERVICE)).toBe('frontend');
		expect(expressionOf(next)).toContain("http.method = 'GET'");
		expect(expressionOf(next)).not.toContain('payment');
	});

	it('clears the key with undefined', () => {
		const first = withFilterValue(queryWith(''), ENVIRONMENT, 'dev');
		const next = withFilterValue(first, ENVIRONMENT, undefined);

		expect(selectedFilterValue(next, ENVIRONMENT)).toBeUndefined();
		expect(expressionOf(next)).not.toContain(ENVIRONMENT);
	});

	it('leaves the other key alone', () => {
		const env = withFilterValue(queryWith(''), ENVIRONMENT, 'dev');
		const both = withFilterValue(env, SERVICE, 'payment');

		expect(selectedFilterValue(both, ENVIRONMENT)).toBe('dev');
		expect(selectedFilterValue(both, SERVICE)).toBe('payment');
	});
});

describe('selectedFilterValue', () => {
	it.each([
		[
			'a single equals',
			[{ key: { key: SERVICE }, op: '=', value: 'payment' }],
			'payment',
		],
		[
			'a one-value IN',
			[{ key: { key: SERVICE }, op: 'in', value: ['payment'] }],
			'payment',
		],
		[
			'a many-value IN',
			[{ key: { key: SERVICE }, op: 'in', value: ['payment', 'frontend'] }],
			undefined,
		],
		[
			'an exclusion',
			[{ key: { key: SERVICE }, op: '!=', value: 'payment' }],
			undefined,
		],
		[
			'another key',
			[{ key: { key: 'host' }, op: '=', value: 'payment' }],
			undefined,
		],
	])('reads %s', (_, items, expected) => {
		expect(selectedFilterValue(queryWith('', items), SERVICE)).toBe(expected);
	});
});
