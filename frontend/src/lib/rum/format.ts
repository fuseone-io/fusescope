const DASH = '—';

/** "8 s ago", "3 min ago", "2 h ago", "4 d ago". */
export function formatAgo(at: number | undefined, now = Date.now()): string {
	if (at === undefined) {
		return DASH;
	}
	const seconds = Math.floor((now - at) / 1000);
	if (seconds < 1) {
		return 'just now';
	}
	if (seconds < 60) {
		return `${seconds} s ago`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)} min ago`;
	}
	if (seconds < 86_400) {
		return `${Math.floor(seconds / 3600)} h ago`;
	}
	return `${Math.floor(seconds / 86_400)} d ago`;
}

/** "48s", "6m 12s", "1h 02m". */
export function formatSessionDuration(ms: number | undefined): string {
	if (ms === undefined || !Number.isFinite(ms)) {
		return DASH;
	}
	const total = Math.max(0, Math.round(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	if (hours > 0) {
		return `${hours}h ${String(minutes).padStart(2, '0')}m`;
	}
	return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** "+6%" from two counts; undefined without a previous count. */
export function formatCountChange(
	current: number,
	previous: number | undefined,
): string | undefined {
	if (previous === undefined || previous <= 0) {
		return undefined;
	}
	const change = Math.round(((current - previous) / previous) * 100);
	return `${change >= 0 ? '+' : '−'}${Math.abs(change)}%`;
}

/** "+0.5 pp" between two percentages. */
export function formatPointChange(
	delta: number | undefined,
): string | undefined {
	if (delta === undefined) {
		return undefined;
	}
	return `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)} pp`;
}
