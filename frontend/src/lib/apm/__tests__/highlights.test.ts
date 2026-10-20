import { serviceBadges, serviceHighlights } from '../highlights';
import { PeriodStats } from '../types';

const stats = (overrides: Partial<PeriodStats> = {}): PeriodStats => ({
	requests: 5040,
	rate: 1.4,
	errorRate: 0.4,
	p99: 318,
	...overrides,
});

describe('serviceBadges', () => {
	it('flags nothing for a steady service', () => {
		expect(serviceBadges(stats(), stats())).toStrictEqual([]);
	});

	it('flags an error rate of 50% or more, whatever the previous period', () => {
		expect(
			serviceBadges(stats({ errorRate: 100 }), stats({ errorRate: 100 })),
		).toStrictEqual([
			expect.objectContaining({
				kind: 'errors',
				tone: 'error',
				text: '100% errors',
			}),
		]);
	});

	it('flags an error rate that tripled', () => {
		expect(
			serviceBadges(stats({ errorRate: 18.5 }), stats({ errorRate: 6.2 })),
		).toStrictEqual([
			expect.objectContaining({
				kind: 'errors',
				tone: 'error',
				text: 'errors ↑3×',
			}),
		]);
	});

	it('flags errors that appeared when the previous period had none', () => {
		expect(
			serviceBadges(stats({ errorRate: 4 }), stats({ errorRate: 0 })),
		).toStrictEqual([
			expect.objectContaining({ kind: 'errors', text: 'new errors' }),
		]);
	});

	it('ignores a doubled error rate below 1%', () => {
		expect(
			serviceBadges(stats({ errorRate: 0.4 }), stats({ errorRate: 0.1 })),
		).toStrictEqual([]);
	});

	it('flags p99 and rate that at least doubled, rounding the factor down', () => {
		expect(
			serviceBadges(
				stats({ p99: 1120, rate: 3.1 }),
				stats({ p99: 540, rate: 1.4 }),
			).map((badge) => [badge.kind, badge.tone, badge.text]),
		).toStrictEqual([
			['p99', 'warning', 'p99 ↑2×'],
			['rate', 'info', 'rate ↑2×'],
		]);
	});

	it('does not compare against an empty previous period', () => {
		expect(
			serviceBadges(stats({ p99: 900, rate: 3 }), stats({ p99: 0, rate: 0 })),
		).toStrictEqual([]);
		expect(serviceBadges(stats(), undefined)).toStrictEqual([]);
	});
});

describe('serviceHighlights', () => {
	it('describes a doubled p99 against the previous period', () => {
		const [highlight] = serviceHighlights({
			current: stats({ p99: 1120 }),
			previous: stats({ p99: 540 }),
			failingDependencies: [],
		});
		expect(highlight).toStrictEqual(
			expect.objectContaining({
				id: 'p99',
				tone: 'warning',
				title: 'p99 latency ↑2.1×',
				detail: '1.12 s against 540 ms in the previous period.',
				links: ['slowTraces', 'endpoints'],
			}),
		);
	});

	it('calls out a downstream dependency failing half its calls or more', () => {
		const highlights = serviceHighlights({
			current: stats(),
			previous: stats(),
			failingDependencies: [{ name: 'payment', errorRate: 100, rate: 1.4 }],
		});
		expect(highlights).toStrictEqual([
			expect.objectContaining({
				id: 'dependency-payment',
				tone: 'error',
				title: 'Downstream payment fails 100% of calls',
				links: ['dependencies', 'errorTraces'],
			}),
		]);
	});

	it('returns nothing when no rule is crossed', () => {
		expect(
			serviceHighlights({
				current: stats(),
				previous: stats(),
				failingDependencies: [],
			}),
		).toStrictEqual([]);
	});
});
