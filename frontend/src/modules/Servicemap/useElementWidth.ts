import { RefObject, useEffect, useRef, useState } from 'react';

/** The element's content width, following resizes; undefined until measured. */
export function useElementWidth<T extends HTMLElement>(): [
	RefObject<T>,
	number | undefined,
] {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState<number>();

	useEffect(() => {
		const element = ref.current;
		if (!element || typeof ResizeObserver === 'undefined') {
			return undefined;
		}
		const observer = new ResizeObserver(([entry]) => {
			setWidth(Math.floor(entry.contentRect.width));
		});
		observer.observe(element);
		return (): void => observer.disconnect();
	}, []);

	return [ref, width];
}
