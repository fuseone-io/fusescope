import { selectionTitle } from '../utils/selectionTitle';

describe('selectionTitle', () => {
	it('names an ALL selection', () => {
		expect(selectionTitle({ value: ['a', 'b'], allSelected: true })).toBe('ALL');
	});

	it('lists every value of a multi selection', () => {
		expect(
			selectionTitle({ value: ['acme', 'globex', 'initech'], allSelected: false }),
		).toBe('acme, globex, initech');
	});

	it('shows a single value in full', () => {
		expect(
			selectionTitle({
				value: 'checkout-service-production-eu-west-1-primary-cluster',
				allSelected: false,
			}),
		).toBe('checkout-service-production-eu-west-1-primary-cluster');
	});

	it('gives no hint for an empty selection', () => {
		expect(selectionTitle({ value: '', allSelected: false })).toBeUndefined();
		expect(selectionTitle({ value: [], allSelected: false })).toBeUndefined();
	});
});
