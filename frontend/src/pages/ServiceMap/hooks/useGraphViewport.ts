import {
	PointerEvent as ReactPointerEvent,
	RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

import {
	fitViewport,
	revealPoint,
	Viewport,
	ZOOM_STEP,
	zoomAround,
} from '../utils/viewport';

interface GraphViewport {
	view: Viewport;
	fit: () => void;
	reveal: (point: { x: number; y: number }) => void;
	zoomIn: () => void;
	zoomOut: () => void;
	onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
	panning: boolean;
}

/**
 * Pan by dragging the background, zoom with the buttons or ⌘/Ctrl + wheel
 * (and trackpad pinch), and fit whenever the content changes size.
 */
export function useGraphViewport(
	container: RefObject<HTMLDivElement>,
	content: { width: number; height: number },
): GraphViewport {
	const [view, setView] = useState<Viewport>({ x: 0, y: 0, k: 1 });
	const drag = useRef<{ x: number; y: number } | null>(null);
	const [panning, setPanning] = useState(false);

	const size = useCallback(
		(): { width: number; height: number } => ({
			width: container.current?.clientWidth ?? 0,
			height: container.current?.clientHeight ?? 0,
		}),
		[container],
	);

	const { width, height } = content;
	const fit = useCallback(() => {
		setView(fitViewport({ width, height }, size()));
	}, [width, height, size]);

	useEffect(() => {
		fit();
		const element = container.current;
		if (!element || typeof ResizeObserver === 'undefined') {
			return undefined;
		}
		const observer = new ResizeObserver(() => fit());
		observer.observe(element);
		return (): void => observer.disconnect();
	}, [container, fit]);

	useEffect(() => {
		const element = container.current;
		if (!element) {
			return undefined;
		}
		const onWheel = (event: WheelEvent): void => {
			if (!event.ctrlKey && !event.metaKey) {
				return;
			}
			event.preventDefault();
			const box = element.getBoundingClientRect();
			const point = { x: event.clientX - box.left, y: event.clientY - box.top };
			setView((current) =>
				zoomAround(current, Math.exp(-event.deltaY * 0.002), point),
			);
		};
		element.addEventListener('wheel', onWheel, { passive: false });
		return (): void => element.removeEventListener('wheel', onWheel);
	}, [container]);

	const zoomCentre = useCallback(
		(factor: number) => {
			const box = size();
			setView((current) =>
				zoomAround(current, factor, { x: box.width / 2, y: box.height / 2 }),
			);
		},
		[size],
	);

	return {
		view,
		fit,
		reveal: useCallback(
			(point: { x: number; y: number }) =>
				setView((current) => revealPoint(current, point, size())),
			[size],
		),
		zoomIn: useCallback(() => zoomCentre(ZOOM_STEP), [zoomCentre]),
		zoomOut: useCallback(() => zoomCentre(1 / ZOOM_STEP), [zoomCentre]),
		panning,
		onPointerDown: (event): void => {
			if (event.button !== 0 || event.target !== event.currentTarget) {
				return;
			}
			drag.current = { x: event.clientX, y: event.clientY };
			event.currentTarget.setPointerCapture?.(event.pointerId);
			setPanning(true);
		},
		onPointerMove: (event): void => {
			const start = drag.current;
			if (!start) {
				return;
			}
			drag.current = { x: event.clientX, y: event.clientY };
			setView((current) => ({
				...current,
				x: current.x + event.clientX - start.x,
				y: current.y + event.clientY - start.y,
			}));
		},
		onPointerUp: (event): void => {
			drag.current = null;
			event.currentTarget.releasePointerCapture?.(event.pointerId);
			setPanning(false);
		},
	};
}
