const DASH = '—';

const isNumber = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isFinite(value);

export function formatLatencyMs(ms: number | undefined): string {
	if (!isNumber(ms)) {
		return DASH;
	}
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(2)} s`;
	}
	if (ms >= 10 || ms === 0) {
		return `${Math.round(ms)} ms`;
	}
	return `${Number(ms.toPrecision(2))} ms`;
}

export function formatRate(perSecond: number | undefined): string {
	if (!isNumber(perSecond)) {
		return DASH;
	}
	return `${perSecond.toFixed(perSecond < 10 ? 2 : 1)} req/s`;
}

export function formatPercent(percent: number | undefined): string {
	if (!isNumber(percent)) {
		return DASH;
	}
	return percent === 100 ? '100%' : `${percent.toFixed(1)}%`;
}

export function formatCount(count: number | undefined): string {
	return isNumber(count) ? Math.round(count).toLocaleString('en-US') : DASH;
}

export const NOT_AVAILABLE = DASH;
