import {
	matchesService,
	ruleFilterSummary,
	serviceMonitors,
} from '../monitors';

const rule = (id: string, expression: string, labels = {}): any => ({
	id,
	alert: id,
	state: 'inactive',
	labels,
	condition: {
		compositeQuery: {
			queries: [
				{ type: 'builder_query', spec: { name: 'A', filter: { expression } } },
				{ type: 'builder_formula', spec: { name: 'F1', expression: 'A / B' } },
			],
		},
	},
});

describe('matchesService', () => {
	it.each([
		["service.name = 'redis-manual'", true],
		["service.name = 'redis-manual' AND has_error = true", true],
		['service.name="redis-manual"', true],
		["service.name IN ['frontend', 'redis-manual']", true],
		["service.name in ('redis-manual')", true],
		["service.name = 'redis'", false],
		["service.name != 'redis-manual'", false],
		["peer.service = 'redis-manual'", false],
		['', false],
	])('%s → %s', (expression, expected) => {
		expect(matchesService(rule('r', expression), 'redis-manual')).toBe(expected);
	});

	it('matches on a service.name label too', () => {
		expect(
			matchesService(rule('r', '', { 'service.name': 'frontend' }), 'frontend'),
		).toBe(true);
	});

	it('matches legacy builder filters', () => {
		const legacy = {
			id: 'old',
			alert: 'old',
			state: 'firing',
			condition: {
				compositeQuery: {
					queries: null,
					builderQueries: {
						A: {
							filters: {
								items: [
									{ key: { key: 'service.name' }, op: 'in', value: ['frontend'] },
								],
							},
						},
					},
				},
			},
		};
		expect(matchesService(legacy as any, 'frontend')).toBe(true);
		expect(matchesService(legacy as any, 'route')).toBe(false);
	});
});

describe('serviceMonitors', () => {
	it('keeps matching rules, firing ones first', () => {
		const rules = [
			rule('calm', "service.name = 'frontend'"),
			{ ...rule('loud', "service.name = 'frontend'"), state: 'firing' },
			rule('other', "service.name = 'route'"),
		];
		expect(
			serviceMonitors(rules, 'frontend').map((item) => item.id),
		).toStrictEqual(['loud', 'calm']);
	});
});

describe('ruleFilterSummary', () => {
	it("reads the first query's filter", () => {
		expect(ruleFilterSummary(rule('r', "service.name = 'a'"))).toBe(
			"service.name = 'a'",
		);
		expect(ruleFilterSummary(rule('r', ''))).toBe('');
	});
});
