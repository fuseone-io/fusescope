export interface ApmWindow {
	/** Epoch ms. */
	start: number;
	end: number;
	/** Length in seconds; also how far back the previous period is shifted. */
	seconds: number;
	/** Seconds per point of sparklines and charts, about 30 points a window. */
	step: number;
}

const POINTS = 30;
const MINUTE = 60;

/** The global time (ns) as a query window. */
export function apmWindow(minTimeNs: number, maxTimeNs: number): ApmWindow {
	const start = Math.floor(minTimeNs / 1e6);
	const end = Math.floor(maxTimeNs / 1e6);
	const seconds = Math.max(1, Math.round((end - start) / 1000));
	const step = Math.max(MINUTE, Math.ceil(seconds / POINTS / MINUTE) * MINUTE);
	return { start, end, seconds, step };
}
