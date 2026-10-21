import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(
		() => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches,
	);
	useEffect(() => {
		const media = window.matchMedia?.(QUERY);
		if (!media) {
			return undefined;
		}
		const onChange = (): void => setReduced(media.matches);
		media.addEventListener?.('change', onChange);
		return (): void => media.removeEventListener?.('change', onChange);
	}, []);
	return reduced;
}
