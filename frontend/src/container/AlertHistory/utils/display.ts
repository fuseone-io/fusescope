import { RuletypesAlertStateDTO } from 'api/generated/services/fuseScope.schemas';
import { StatusTone } from 'components/PageTemplate/types';

export type TimelineSortOrder = 'ascend' | 'descend';

/** The STATE header cycles like an uncontrolled antd sorter: none → ascend → descend → none. */
export function nextSortOrder(
	current: TimelineSortOrder | null,
): TimelineSortOrder | null {
	if (current === null) {
		return 'ascend';
	}
	return current === 'ascend' ? 'descend' : null;
}

interface AlertStateBadge {
	tone: StatusTone;
	label: string;
}

const ALERT_STATE_BADGES: Record<string, AlertStateBadge> = {
	[RuletypesAlertStateDTO.firing]: { tone: 'error', label: 'Firing' },
	[RuletypesAlertStateDTO.inactive]: { tone: 'success', label: 'Resolved' },
	normal: { tone: 'success', label: 'Resolved' },
	[RuletypesAlertStateDTO.nodata]: { tone: 'warning', label: 'No Data' },
	[RuletypesAlertStateDTO.disabled]: { tone: 'neutral', label: 'Muted' },
};

export function alertStateBadge(state: string): AlertStateBadge | null {
	return ALERT_STATE_BADGES[state] ?? null;
}

/** `count` as a share of `total`, clamped to 0–100 like a progress bar. */
export function contributionPercent(count: number, total: number): number {
	const percent = (count / total) * 100;
	if (!Number.isFinite(percent)) {
		return 0;
	}
	return Math.min(Math.max(percent, 0), 100);
}

/** First and last 1-based row numbers shown on `page`. */
export function timelineRange(
	page: number,
	pageSize: number,
	total: number,
): [number, number] {
	if (total === 0) {
		return [0, 0];
	}
	return [(page - 1) * pageSize + 1, Math.min(page * pageSize, total)];
}
