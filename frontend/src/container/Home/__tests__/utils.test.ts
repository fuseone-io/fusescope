import dayjs from 'dayjs';

import {
	alertsSummary,
	homeTitle,
	ingestedCount,
	receivingSummary,
	savedViewsDocsLink,
	timeAgo,
} from '../utils';

const valuePayload = (value: string | undefined): unknown => ({
	data: {
		newResult: {
			data: {
				result: [
					{
						table: {
							columns: [{ id: 'A' }],
							rows: value === undefined ? [] : [{ data: { A: value } }],
						},
					},
				],
			},
		},
	},
});

describe('ingestedCount', () => {
	it.each([
		['a counted value', valuePayload('9254'), 9254],
		['no rows', valuePayload(undefined), 0],
		['no table', { data: {} }, 0],
		['nothing loaded', undefined, 0],
		['a non-numeric value', valuePayload('n/a'), 0],
	])('reads %s', (_, payload, expected) => {
		expect(ingestedCount(payload)).toBe(expected);
	});
});

describe('homeTitle', () => {
	it.each([
		['Jane Doe', true, 'Welcome back, Jane'],
		['Jane', false, 'Welcome, Jane'],
		['', true, 'Welcome back'],
		[undefined, false, 'Welcome to FuseScope'],
		['  ', false, 'Welcome to FuseScope'],
	])('greets %p (receiving data: %p)', (name, receiving, expected) => {
		expect(homeTitle(name, receiving)).toBe(expected);
	});
});

describe('receivingSummary', () => {
	it.each([
		[
			{ logs: true, traces: true, metrics: true },
			'Your workspace is receiving logs, traces and metrics.',
		],
		[
			{ logs: true, traces: false, metrics: true },
			'Your workspace is receiving logs and metrics.',
		],
		[
			{ logs: false, traces: true, metrics: false },
			'Your workspace is receiving traces.',
		],
		[
			{ logs: false, traces: false, metrics: false },
			'You are not sending any data yet.',
		],
	])('summarises %p', (signals, expected) => {
		expect(receivingSummary(signals)).toBe(expected);
	});
});

describe('alertsSummary', () => {
	it.each([
		[['firing', 'firing', 'pending', 'inactive'], '2 firing, 1 pending'],
		[['firing'], '1 firing'],
		[['pending', 'pending'], '2 pending'],
		[['inactive', 'disabled'], '2 rules, none firing'],
		[['inactive'], '1 rule, none firing'],
		[[], ''],
	])('counts %p', (states, expected) => {
		expect(alertsSummary(states.map((state) => ({ state })))).toBe(expected);
	});
});

describe('timeAgo', () => {
	const now = dayjs('2026-10-20T12:00:00Z');

	it.each([
		['2026-10-20T11:59:40Z', 'just now'],
		['2026-10-20T11:48:00Z', '12 min ago'],
		['2026-10-20T11:00:00Z', '1 h ago'],
		['2026-10-20T07:00:00Z', '5 h ago'],
		['2026-10-19T09:00:00Z', 'yesterday'],
		['2026-10-18T09:00:00Z', '2 days ago'],
		['2026-08-01T09:00:00Z', '2 months ago'],
		['2024-08-01T09:00:00Z', '2 years ago'],
		[undefined, ''],
		['not a date', ''],
	])('labels %p', (time, expected) => {
		expect(timeAgo(time, now)).toBe(expected);
	});
});

describe('savedViewsDocsLink', () => {
	it.each([
		['logs', '/explore/logs/#alerts-dashboards-and-saved-views'],
		['traces', '/explore/traces/#saved-views'],
		['metrics', '/explore/metrics/#views-alerts-and-dashboards'],
	])('links the %s views to their docs section', (entity, path) => {
		expect(savedViewsDocsLink(entity)).toMatch(new RegExp(`${path}$`));
	});
});
