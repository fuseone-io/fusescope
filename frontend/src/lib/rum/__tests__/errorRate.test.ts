import { errorRateDelta, sessionErrorRate } from '../errorRate';

describe('sessionErrorRate', () => {
	it.each([
		[2, 100, 2],
		[1, 3, 33.33333333333333],
		[0, 50, 0],
		[5, 4, 100],
	])('%d of %d sessions with errors is %d%%', (errors, sessions, rate) => {
		expect(sessionErrorRate(errors, sessions)).toBeCloseTo(rate);
	});

	it('is undefined without sessions', () => {
		expect(sessionErrorRate(3, 0)).toBeUndefined();
	});
});

describe('errorRateDelta', () => {
	it.each([
		[1.8, 1.7, 0.1],
		[0.7, 0.9, -0.2],
	])('%d%% against %d%% is %d pp', (current, previous, delta) => {
		expect(errorRateDelta(current, previous)).toBeCloseTo(delta);
	});

	it('is undefined when either period has no rate', () => {
		expect(errorRateDelta(1, undefined)).toBeUndefined();
		expect(errorRateDelta(undefined, 1)).toBeUndefined();
	});
});
