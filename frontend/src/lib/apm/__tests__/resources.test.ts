import { serviceResources } from '../resources';

const window = { start: 0, end: 3_600_000, seconds: 3600, step: 60 };

const result = (
	queryName: string,
	groups: string[],
	aggregations: number,
	data: unknown[][],
): unknown => ({
	queryName,
	columns: [
		...groups.map((name) => ({ name, queryName, columnType: 'group' })),
		...Array.from({ length: aggregations }, (_, index) => ({
			name: `__result_${index}`,
			queryName,
			aggregationIndex: index,
			columnType: 'aggregation',
		})),
	],
	data,
});

describe('serviceResources', () => {
	it('reads hosts with their share of traffic, and the service environments and languages', () => {
		const resources = serviceResources(
			{
				data: {
					results: [
						result('A', ['host.name'], 4, [
							['a4c1f09e2b7d', 3672, 260, 1.1e9, '2026-10-20T14:45:00Z'],
							['e91b3d6c0f58', 2448, 169, 1.15e9, '2026-10-20T14:44:00Z'],
							['', 10, 0, 1e6, '2026-10-20T14:40:00Z'],
						]),
						result('B', ['deployment.environment', 'telemetry.sdk.language'], 1, [
							['dev', 'go', 6000],
							['prod', 'go', 120],
							['', '', 10],
						]),
					],
				},
			},
			window,
		);
		expect(resources.hosts).toStrictEqual([
			{
				name: 'a4c1f09e2b7d',
				requests: 3672,
				rate: 3672 / 3600,
				errorRate: (260 / 3672) * 100,
				p99: 1100,
				share: (3672 / 6120) * 100,
				lastSeen: Date.parse('2026-10-20T14:45:00Z'),
			},
			expect.objectContaining({ name: 'e91b3d6c0f58', p99: 1150 }),
		]);
		expect(resources.environments).toStrictEqual(['dev', 'prod']);
		expect(resources.languages).toStrictEqual(['go']);
	});

	it('is empty without a response', () => {
		expect(serviceResources(undefined, window)).toStrictEqual({
			hosts: [],
			environments: [],
			languages: [],
		});
	});
});
