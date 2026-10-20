import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';

export interface LastRun {
	finishedAt: Date;
	durationMs: number;
}

/** When the last query run finished and how long it took, measured here. */
export function useLastRun(isFetching: boolean): LastRun | null {
	const startedAt = useRef<number | null>(null);
	const [lastRun, setLastRun] = useState<LastRun | null>(null);

	useEffect(() => {
		if (isFetching) {
			startedAt.current = performance.now();
			return;
		}
		if (startedAt.current !== null) {
			setLastRun({
				finishedAt: new Date(),
				durationMs: performance.now() - startedAt.current,
			});
			startedAt.current = null;
		}
	}, [isFetching]);

	return lastRun;
}

/** "Last run 14:30:02 · 412 ms". */
export function formatLastRun(run: LastRun): string {
	return `Last run ${dayjs(run.finishedAt).format('HH:mm:ss')} · ${Math.round(
		run.durationMs,
	)} ms`;
}
