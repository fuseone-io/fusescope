import {
	formatDomainMetricsDataForTable,
	getFormattedEndPointMetricsData,
} from '../utils';

const EPOCH = '1970-01-01T00:00:00Z';

describe('last used with no calls in range', () => {
	it.each([EPOCH, '0', 0])(
		'domain metrics treat %s as no last call',
		(value) => {
			expect(
				formatDomainMetricsDataForTable({
					data: { A: 0, B: 'n/a', D: value, F1: 'n/a' },
				}).lastUsed,
			).toBe('-');
		},
	);

	it('endpoint metrics treat the epoch as no last use', () => {
		expect(
			getFormattedEndPointMetricsData([
				{ data: { A: 0, B: 'n/a', D: EPOCH, F1: 'n/a' } },
			] as never).lastUsed,
		).toBe('-');
	});

	it('keeps a real timestamp', () => {
		expect(
			formatDomainMetricsDataForTable({
				data: { A: 1, B: 1, D: new Date().toISOString(), F1: 0 },
			}).lastUsed,
		).toMatch(/ago$/);
	});
});
