import { fitViewport, revealPoint, zoomAround } from '../utils/viewport';

describe('fitViewport', () => {
	it('scales the content down to fit and centres it', () => {
		expect(
			fitViewport({ width: 2000, height: 500 }, { width: 1000, height: 500 }),
		).toStrictEqual({ k: 0.5, x: 0, y: 125 });
	});

	it('does not blow small graphs up past a readable size', () => {
		expect(
			fitViewport({ width: 100, height: 100 }, { width: 1000, height: 1000 }).k,
		).toBeLessThan(1.2);
	});

	it('keeps a floor for very large graphs', () => {
		expect(
			fitViewport({ width: 100000, height: 100 }, { width: 500, height: 500 }).k,
		).toBe(0.2);
	});

	it('is the identity before the container is measured', () => {
		expect(
			fitViewport({ width: 10, height: 10 }, { width: 0, height: 0 }),
		).toStrictEqual({
			x: 0,
			y: 0,
			k: 1,
		});
	});
});

describe('zoomAround', () => {
	it('keeps the point under the cursor in place', () => {
		const view = { x: 10, y: 20, k: 1 };
		const zoomed = zoomAround(view, 2, { x: 110, y: 120 });
		expect(zoomed.k).toBe(2);
		expect((110 - zoomed.x) / zoomed.k).toBe((110 - view.x) / view.k);
		expect((120 - zoomed.y) / zoomed.k).toBe((120 - view.y) / view.k);
	});

	it('stops at the zoom limits', () => {
		expect(zoomAround({ x: 0, y: 0, k: 2 }, 10, { x: 0, y: 0 }).k).toBe(2.5);
		expect(zoomAround({ x: 0, y: 0, k: 0.3 }, 0.1, { x: 0, y: 0 }).k).toBe(0.2);
	});
});

describe('revealPoint', () => {
	const box = { width: 800, height: 600 };

	it('leaves a visible point alone', () => {
		const view = { x: 0, y: 0, k: 1 };
		expect(revealPoint(view, { x: 400, y: 300 }, box)).toBe(view);
	});

	it('centres a point outside the view, keeping the zoom', () => {
		expect(
			revealPoint({ x: 0, y: 0, k: 2 }, { x: 900, y: 50 }, box),
		).toStrictEqual({
			x: 400 - 1800,
			y: 300 - 100,
			k: 2,
		});
	});
});
