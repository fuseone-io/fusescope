import { useEffect, useState } from 'react';

/** The id of the topmost step panel in view, tracked with an IntersectionObserver. */
export function useActiveStep(ids: string[]): string {
	const [active, setActive] = useState(ids[0]);
	const key = ids.join(',');

	useEffect(() => {
		if (typeof IntersectionObserver === 'undefined') {
			return undefined;
		}
		const visible = new Set<string>();
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						visible.add(entry.target.id);
					} else {
						visible.delete(entry.target.id);
					}
				});
				const first = key.split(',').find((id) => visible.has(id));
				if (first) {
					setActive(first);
				}
			},
			{ rootMargin: '0px 0px -60% 0px' },
		);
		key.split(',').forEach((id) => {
			const element = document.getElementById(id);
			if (element) {
				observer.observe(element);
			}
		});
		return (): void => observer.disconnect();
	}, [key]);

	return active;
}
