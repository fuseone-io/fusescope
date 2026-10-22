import { allOf, inList } from 'lib/apm/filters';
import { rangeRequest, RangeResponse, rawScalarRows } from 'lib/apm/queryRange';
import { ApmWindow } from 'lib/apm/window';
import { QueryEnvelope, QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import {
	applicationFilter,
	exceptionEventsFilter,
	RUM_ATTRIBUTES,
} from './attributes';
import { SessionRequest } from './overviewTypes';
import { logQuery, numberCell } from './queryRange';

const REQUEST_FIELDS = [
	'trace_id',
	'span_id',
	'name',
	'duration_nano',
	'has_error',
	'http.request.method',
	'http.response.status_code',
	'url.full',
	RUM_ATTRIBUTES.sessionId,
];

const sessionsFilter = (applicationId: string, sessionIds: string[]): string =>
	allOf(
		applicationFilter(applicationId),
		`${RUM_ATTRIBUTES.sessionId} IN ${inList(sessionIds)}`,
	);

/** Errors per session (scalar) for the sessions shown. */
export function sessionErrorsRequest(
	window: ApmWindow,
	applicationId: string,
	sessionIds: string[],
): QueryRangeRequestV5 {
	return rangeRequest(window, 'scalar', [
		logQuery({
			name: 'SE',
			filter: allOf(
				sessionsFilter(applicationId, sessionIds),
				exceptionEventsFilter,
			),
			groupBy: [RUM_ATTRIBUTES.sessionId],
			aggregations: ['count()'],
		}),
	]);
}

/** The browser's HTTP spans of the sessions, slowest first. */
export function sessionRequestsRequest(
	window: ApmWindow,
	applicationId: string,
	sessionIds: string[],
): QueryRangeRequestV5 {
	return rangeRequest(window, 'raw', [
		{
			type: 'builder_query',
			spec: {
				name: 'RQ',
				signal: 'traces',
				filter: {
					expression: allOf(
						sessionsFilter(applicationId, sessionIds),
						'http.request.method EXISTS',
					),
				},
				selectFields: REQUEST_FIELDS.map((name) => ({ name })),
				order: [{ key: { name: 'duration_nano' }, direction: 'desc' }],
				limit: 500,
			},
		} as QueryEnvelope,
	]);
}

export function sessionErrorCounts(
	response: RangeResponse | undefined,
): Record<string, number> {
	return Object.fromEntries(
		rawScalarRows(response, 'SE').map((row) => [
			row.labels[RUM_ATTRIBUTES.sessionId],
			numberCell(row.values[0]) || 0,
		]),
	);
}

interface RawRow {
	data?: Record<string, unknown>;
}

const text = (value: unknown): string =>
	typeof value === 'string' || typeof value === 'number' ? String(value) : '';

function toRequest(data: Record<string, unknown>): SessionRequest {
	const status = Number(data['http.response.status_code']);
	const method = text(data['http.request.method']);
	let path = text(data['url.full']);
	try {
		path = path ? new URL(path).pathname : text(data.name);
	} catch {
		path = text(data.name);
	}
	const durationMs = (Number(data.duration_nano) || 0) / 1e6;
	return {
		sessionId: text(data[RUM_ATTRIBUTES.sessionId]),
		traceId: text(data.trace_id),
		spanId: text(data.span_id),
		label: [method, path, Number.isFinite(status) && status > 0 ? status : '']
			.filter(Boolean)
			.join(' '),
		durationMs,
		failed: data.has_error === true || status >= 500,
	};
}

/** Per session, its first failing request, else its slowest. */
export function pickSessionRequests(
	response: RangeResponse | undefined,
): Record<string, SessionRequest> {
	const rows = (response?.data?.results ?? []).flatMap(
		(result) => ((result as { rows?: RawRow[] | null }).rows ?? []) as RawRow[],
	);
	const picked: Record<string, SessionRequest> = {};
	rows
		.map((row) => toRequest(row.data ?? {}))
		.filter((request) => request.sessionId && request.traceId)
		.forEach((request) => {
			const current = picked[request.sessionId];
			if (
				!current ||
				(request.failed && !current.failed) ||
				(request.failed === current.failed &&
					request.durationMs > current.durationMs)
			) {
				picked[request.sessionId] = request;
			}
		});
	return picked;
}
