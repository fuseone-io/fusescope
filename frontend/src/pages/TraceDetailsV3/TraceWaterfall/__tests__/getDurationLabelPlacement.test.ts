import { getDurationLabelPlacement } from '../utils';

describe('getDurationLabelPlacement', () => {
	it('places the label after a bar that ends early enough', () => {
		expect(getDurationLabelPlacement(10, 30)).toStrictEqual({
			side: 'after',
			offsetPercent: 40,
		});
	});

	it('places the label before a bar that ends near the right edge', () => {
		expect(getDurationLabelPlacement(60, 38)).toStrictEqual({
			side: 'before',
			offsetPercent: 40,
		});
	});

	it('places the label inside a bar that spans almost the whole trace', () => {
		expect(getDurationLabelPlacement(0, 100)).toStrictEqual({
			side: 'inside',
			offsetPercent: 0,
		});
	});
});
