import { countFromResult } from '../countFromResult';

describe('countFromResult', () => {
	it('reads the count from a table result', () => {
		expect(
			countFromResult({
				table: {
					columns: [
						{ name: 'count()', queryName: 'A', isValueColumn: true, id: 'A.count()' },
					],
					rows: [{ data: { 'A.count()': 1284 } }],
				},
			} as never),
		).toBe(1284);
	});

	it('reads the count from a series result', () => {
		expect(
			countFromResult({
				series: [{ values: [{ timestamp: 1, value: '42' }] }],
			} as never),
		).toBe('42');
	});

	it('has no count without a result', () => {
		expect(countFromResult(undefined)).toBeUndefined();
	});
});
