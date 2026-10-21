export interface Viewport {
	x: number;
	y: number;
	k: number;
}

export const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;
const MAX_FIT_SCALE = 1.15;

const clamp = (k: number): number =>
	Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));

export function fitViewport(
	content: { width: number; height: number },
	box: { width: number; height: number },
): Viewport {
	if (box.width <= 0 || box.height <= 0) {
		return { x: 0, y: 0, k: 1 };
	}
	const k = clamp(
		Math.min(
			box.width / content.width,
			box.height / content.height,
			MAX_FIT_SCALE,
		),
	);
	return {
		x: (box.width - content.width * k) / 2,
		y: (box.height - content.height * k) / 2,
		k,
	};
}

/** `factor` around the point (px from the container's corner). */
export function zoomAround(
	view: Viewport,
	factor: number,
	point: { x: number; y: number },
): Viewport {
	const k = clamp(view.k * factor);
	const ratio = k / view.k;
	return {
		k,
		x: point.x - (point.x - view.x) * ratio,
		y: point.y - (point.y - view.y) * ratio,
	};
}

/** The view moved just enough to show the point with a margin, or unchanged. */
export function revealPoint(
	view: Viewport,
	point: { x: number; y: number },
	box: { width: number; height: number },
	margin = 80,
): Viewport {
	const x = view.x + point.x * view.k;
	const y = view.y + point.y * view.k;
	const inside =
		x >= margin &&
		x <= box.width - margin &&
		y >= margin &&
		y <= box.height - margin;
	if (inside || box.width <= 0 || box.height <= 0) {
		return view;
	}
	return {
		...view,
		x: box.width / 2 - point.x * view.k,
		y: box.height / 2 - point.y * view.k,
	};
}
