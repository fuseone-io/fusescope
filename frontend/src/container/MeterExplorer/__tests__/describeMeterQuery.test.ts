import { ICompositeMetricQuery } from 'types/api/alerts/compositeQuery';

import { describeMeterQuery } from '../describeMeterQuery';

const composite = (queries: Record<string, unknown>): ICompositeMetricQuery =>
	({ builderQueries: queries }) as never;

const meterQuery = (overrides: Record<string, unknown> = {}): unknown => ({
	queryName: 'A',
	aggregateAttribute: { key: 'signoz.meter.log.size' },
	timeAggregation: 'increase',
	spaceAggregation: 'sum',
	filter: { expression: '' },
	groupBy: [],
	disabled: false,
	...overrides,
});

describe('describeMeterQuery', () => {
	it.each([
		['a bare meter', meterQuery(), 'sum(increase(signoz.meter.log.size))'],
		[
			'a grouped meter',
			meterQuery({ groupBy: [{ key: 'service.name' }] }),
			'sum(increase(signoz.meter.log.size)) by service.name',
		],
		[
			'a filtered meter',
			meterQuery({ filter: { expression: "deployment.environment = 'dev'" } }),
			"sum(increase(signoz.meter.log.size)) where deployment.environment = 'dev'",
		],
		[
			'a meter with no metric yet',
			meterQuery({ aggregateAttribute: { key: '' } }),
			'',
		],
	])('reads %s', (_, query, expected) => {
		expect(describeMeterQuery(composite({ A: query }))).toBe(expected);
	});

	it('joins the enabled queries', () => {
		expect(
			describeMeterQuery(
				composite({
					A: meterQuery(),
					B: meterQuery({
						queryName: 'B',
						aggregateAttribute: { key: 'signoz.meter.span.count' },
					}),
					C: meterQuery({ queryName: 'C', disabled: true }),
				}),
			),
		).toBe(
			'sum(increase(signoz.meter.log.size)); sum(increase(signoz.meter.span.count))',
		);
	});

	it('is empty without builder queries', () => {
		expect(describeMeterQuery({} as ICompositeMetricQuery)).toBe('');
	});
});
