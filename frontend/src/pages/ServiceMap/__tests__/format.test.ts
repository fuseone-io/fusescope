import { edgePath, languageBadge, nodeAriaLabel } from '../utils/format';
import { SERVICE_KIND_STUB } from './fixtures';

describe('languageBadge', () => {
	it.each<[string | undefined, string | undefined]>([
		['go', 'GO'],
		['python', 'PY'],
		['nodejs', 'JS'],
		['webjs', 'JS'],
		['java', 'JV'],
		['dotnet', 'C#'],
		['cpp', 'C++'],
		['rust', 'RS'],
		['ruby', 'RB'],
		['php', 'PHP'],
		['elixir', 'EL'],
		['', undefined],
		[undefined, undefined],
	])('%s is %s', (language, expected) => {
		expect(languageBadge(language)).toBe(expected);
	});
});

describe('edgePath', () => {
	it('bends forward calls into an S between the columns', () => {
		expect(edgePath({ x: 0, y: 0 }, { x: 200, y: 100 })).toStrictEqual({
			d: 'M0 0 C100 0 100 100 200 100',
			mid: { x: 100, y: 50 },
		});
	});

	it('loops calls back to the same or an earlier column around the right', () => {
		const { d, mid } = edgePath({ x: 200, y: 0 }, { x: 200, y: 100 });
		expect(d).toBe('M200 0 C320 0 320 100 200 100');
		expect(mid.x).toBeGreaterThan(200);
	});
});

describe('nodeAriaLabel', () => {
	it('names the node with its kind, health and traffic', () => {
		expect(
			nodeAriaLabel(
				{
					id: 'driver',
					inferred: false,
					kind: SERVICE_KIND_STUB,
					rate: 0.37,
					errorRate: 18.5,
				},
				'Critical',
			),
		).toBe('driver, Service, Critical, 0.37 req/s, 18.5% errors');
	});

	it('says when a node is inferred', () => {
		expect(
			nodeAriaLabel(
				{ id: 'x', inferred: true, kind: SERVICE_KIND_STUB, rate: 1, errorRate: 0 },
				'Healthy',
			),
		).toContain('inferred');
	});
});
