import { fuseScopeDocsUrl } from 'constants/docs';
import dayjs, { Dayjs } from 'dayjs';
import get from 'lodash-es/get';

export interface IngestingSignals {
	logs: boolean;
	traces: boolean;
	metrics: boolean;
}

/** The count a Home `VALUE` query returned; 0 when nothing came back. */
export function ingestedCount(payload: unknown): number {
	const table = get(payload, 'data.newResult.data.result[0].table');
	if (!table) {
		return 0;
	}
	const key = String(get(table, 'columns[0].id'));
	const value = Number.parseInt(
		String(get(table, ['rows', 0, 'data', key]) ?? '0'),
		10,
	);
	return Number.isFinite(value) ? value : 0;
}

export function homeTitle(
	displayName: string | undefined,
	receiving: boolean,
): string {
	const firstName = (displayName ?? '').trim().split(/\s+/)[0];
	if (receiving) {
		return firstName ? `Welcome back, ${firstName}` : 'Welcome back';
	}
	return firstName ? `Welcome, ${firstName}` : 'Welcome to FuseScope';
}

function listOf(words: string[]): string {
	return words.length > 1
		? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
		: words.join('');
}

export function receivingSummary(signals: IngestingSignals): string {
	const receiving = (['logs', 'traces', 'metrics'] as const).filter(
		(signal) => signals[signal],
	);
	if (receiving.length === 0) {
		return 'You are not sending any data yet.';
	}
	return `Your workspace is receiving ${listOf([...receiving])}.`;
}

export function alertsSummary(rules: { state?: string }[]): string {
	if (rules.length === 0) {
		return '';
	}
	const count = (state: string): number =>
		rules.filter((rule) => rule.state === state).length;
	const parts = (['firing', 'pending'] as const)
		.map((state) => ({ state, n: count(state) }))
		.filter(({ n }) => n > 0)
		.map(({ state, n }) => `${n} ${state}`);
	if (parts.length > 0) {
		return parts.join(', ');
	}
	return `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}, none firing`;
}

const plural = (n: number, unit: string): string =>
	`${n} ${unit}${n === 1 ? '' : 's'} ago`;

export function timeAgo(
	time: string | undefined,
	now: Dayjs = dayjs(),
): string {
	const then = dayjs(time);
	if (!time || !then.isValid()) {
		return '';
	}
	const minutes = now.diff(then, 'minute');
	if (minutes < 1) {
		return 'just now';
	}
	if (minutes < 60) {
		return `${minutes} min ago`;
	}
	const hours = now.diff(then, 'hour');
	if (hours < 24) {
		return `${hours} h ago`;
	}
	const days = now.diff(then, 'day');
	if (days === 1) {
		return 'yesterday';
	}
	const months = now.diff(then, 'month');
	if (months < 1) {
		return plural(days, 'day');
	}
	const years = now.diff(then, 'year');
	return years < 1 ? plural(months, 'month') : plural(years, 'year');
}

const SAVED_VIEWS_DOCS: Record<string, string> = {
	logs: '/explore/logs/#alerts-dashboards-and-saved-views',
	traces: '/explore/traces/#saved-views',
	metrics: '/explore/metrics/#views-alerts-and-dashboards',
};

export function savedViewsDocsLink(entity: string): string {
	return fuseScopeDocsUrl(SAVED_VIEWS_DOCS[entity] ?? SAVED_VIEWS_DOCS.logs);
}
