import {
	alertStateBadge,
	contributionPercent,
	nextSortOrder,
	timelineRange,
} from '../utils/display';

describe('nextSortOrder', () => {
	it.each([
		[null, 'ascend'],
		['ascend', 'descend'],
		['descend', null],
	] as const)('%s → %s', (current, expected) => {
		expect(nextSortOrder(current)).toBe(expected);
	});
});

describe('alertStateBadge', () => {
	it.each([
		['firing', 'error', 'Firing'],
		['inactive', 'success', 'Resolved'],
		['normal', 'success', 'Resolved'],
		['nodata', 'warning', 'No Data'],
		['disabled', 'neutral', 'Muted'],
	])('%s → %s %s', (state, tone, label) => {
		expect(alertStateBadge(state)).toStrictEqual({ tone, label });
	});

	it('returns null for states without a badge', () => {
		expect(alertStateBadge('pending')).toBeNull();
	});
});

describe('contributionPercent', () => {
	it.each([
		[1, 4, 25],
		[3, 3, 100],
		[5, 2, 100],
		[0, 0, 0],
		[1, 0, 0],
	])('%i of %i → %d', (count, total, expected) => {
		expect(contributionPercent(count, total)).toBe(expected);
	});
});

describe('timelineRange', () => {
	it.each([
		[1, 20, 45, [1, 20]],
		[3, 20, 45, [41, 45]],
		[1, 20, 0, [0, 0]],
	])('page %i size %i total %i', (page, size, total, expected) => {
		expect(timelineRange(page, size, total)).toStrictEqual(expected);
	});
});
