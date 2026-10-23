import type {
	RumtypesActionEventDTO,
	RumtypesErrorEventInfoDTO,
	RumtypesGettableSessionDTO,
	RumtypesSessionViewDTO,
	RumtypesTimelineEventDTO,
} from 'api/generated/services/fuseScope.schemas';
import { allOf, quote } from 'lib/apm/filters';
import {
	applicationFilter,
	exceptionEventsFilter,
	RUM_ATTRIBUTES,
} from 'lib/rum/attributes';
import { RATING_LABELS } from 'components/Rum/constants';
import { formatVital } from 'lib/rum/vitals';

import { SLOW_REQUEST_MS } from '../constants';
import { requestLabel } from '../Views/utils';
import {
	EventDescription,
	EventKindFilter,
	EventTone,
	KindCounts,
	RequestBar,
	ViewStrip,
	ViewSummary,
} from './types';

/** "6:12.2", minutes and seconds from the session start. */
export function sessionClock(ms: number): string {
	const tenths = Math.max(0, Math.round(ms / 100));
	const minutes = Math.floor(tenths / 600);
	const seconds = (tenths % 600) / 10;
	return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

const KINDS: Record<Exclude<EventKindFilter, 'all' | 'views'>, string[]> = {
	actions: ['click', 'action'],
	requests: ['request'],
	errors: ['error'],
	vitals: ['vital'],
};

export function matchesKind(
	event: RumtypesTimelineEventDTO,
	kind: EventKindFilter,
): boolean {
	if (kind === 'all') {
		return true;
	}
	return kind !== 'views' && KINDS[kind].includes(event.kind);
}

export const timelineViews = (
	session: RumtypesGettableSessionDTO,
): RumtypesSessionViewDTO[] => session.timeline ?? [];

function allEvents(
	session: RumtypesGettableSessionDTO,
): RumtypesTimelineEventDTO[] {
	return [
		...(session.leadingEvents ?? []),
		...timelineViews(session).flatMap((view) => view.events ?? []),
	];
}

export function kindCounts(session: RumtypesGettableSessionDTO): KindCounts {
	const events = allEvents(session);
	const count = (kind: keyof typeof KINDS): number =>
		events.filter((event) => matchesKind(event, kind)).length;
	const views = timelineViews(session).length;
	return {
		all: views + events.length,
		views,
		actions: count('actions'),
		requests: count('requests'),
		errors: count('errors'),
		vitals: count('vitals'),
	};
}

const clamp = (value: number): number => Math.min(100, Math.max(0, value));

export function viewStrip(session: RumtypesGettableSessionDTO): ViewStrip {
	const start = Date.parse(session.startedAt);
	const total = Math.max(session.durationMs, 1);
	const at = (timestamp: string): number => Date.parse(timestamp) - start;
	const percent = (ms: number): number => clamp((ms * 100) / total);

	const segments = timelineViews(session).map((view) => {
		const startMs = at(view.timestamp);
		const left = percent(startMs);
		return {
			spanId: view.spanId,
			route: view.route,
			startMs,
			left,
			width: Math.min(percent(startMs + view.durationMs), 100) - left,
		};
	});
	const events = allEvents(session);
	return {
		segments,
		actions: [
			...new Set(
				events
					.filter((event) => matchesKind(event, 'actions'))
					.map((event) => percent(at(event.timestamp))),
			),
		],
		errors: events
			.filter((event) => event.error)
			.map((event) => ({
				left: percent(at(event.timestamp)),
				title: `${sessionClock(at(event.timestamp))} ${event.error?.type}: ${event.error?.message}`,
			})),
	};
}

/** The view's requests on its own time axis, as far as the longest one reaches. */
export function waterfallSpanMs(view: RumtypesSessionViewDTO): number {
	const start = Date.parse(view.timestamp);
	return Math.max(
		view.durationMs,
		...(view.events ?? []).map(
			(event) =>
				Date.parse(event.timestamp) - start + (event.request?.durationMs ?? 0),
		),
		1,
	);
}

export function requestBars(view: RumtypesSessionViewDTO): RequestBar[] {
	const start = Date.parse(view.timestamp);
	const requests = (view.events ?? []).filter((event) => event.request);
	const span = waterfallSpanMs(view);
	return requests.flatMap((event) => {
		const { request } = event;
		if (!request) {
			return [];
		}
		return [
			{
				spanId: request.spanId,
				label: requestLabel(request),
				left: ((Date.parse(event.timestamp) - start) * 100) / span,
				width: (request.durationMs * 100) / span,
				durationMs: request.durationMs,
				failed: request.failed,
				slow: request.durationMs >= SLOW_REQUEST_MS,
			},
		];
	});
}

export function viewSummary(view: RumtypesSessionViewDTO): ViewSummary {
	const events = view.events ?? [];
	const lcp = events.find((event) => event.vital?.name === 'lcp')?.vital;
	return {
		requests: events.filter((event) => matchesKind(event, 'requests')).length,
		actions: events.filter((event) => matchesKind(event, 'actions')).length,
		errors: events.filter((event) => matchesKind(event, 'errors')).length,
		lcp: lcp ? { value: lcp.value, rating: lcp.rating } : undefined,
	};
}

/** Views with an error start open; without any, the first view does. */
export function defaultExpanded(
	session: RumtypesGettableSessionDTO,
): Set<string> {
	const views = timelineViews(session);
	const failing = views.filter((view) => viewSummary(view).errors > 0);
	const open = failing.length > 0 ? failing : views.slice(0, 1);
	return new Set(open.map((view) => view.spanId));
}

/** The session's telemetry, or one of its errors, for the explorers. */
export function sessionFilter(
	applicationId: string,
	sessionId: string,
	error?: RumtypesErrorEventInfoDTO,
): string {
	const filter = allOf(
		applicationFilter(applicationId),
		`${RUM_ATTRIBUTES.sessionId} = ${quote(sessionId)}`,
	);
	if (!error) {
		return filter;
	}
	return allOf(
		filter,
		exceptionEventsFilter,
		`${RUM_ATTRIBUTES.exceptionType} = ${quote(error.type)}`,
		error.message
			? `${RUM_ATTRIBUTES.exceptionMessage} = ${quote(error.message)}`
			: '',
	);
}

const RATING_TONES: Record<string, EventTone> = {
	good: 'success',
	'needs-improvement': 'warning',
	poor: 'error',
};

function describeAction(
	custom: boolean,
	action: RumtypesActionEventDTO,
): EventDescription {
	return {
		label: custom ? 'Action' : 'Click',
		title: (custom ? action.name : action.target) || action.target || action.type,
		detail: custom ? 'custom action' : '',
		tone: 'action',
	};
}

/** What a timeline row says about an event. */
export function describeEvent(
	event: RumtypesTimelineEventDTO,
): EventDescription {
	const { request, action, error, vital } = event;
	if (request) {
		return {
			label: 'Request',
			title: requestLabel(request),
			detail: request.hasBackend
				? `backend ${request.backendService || 'service'}`
				: 'no backend spans in the trace',
			tone: request.failed ? 'error' : 'neutral',
		};
	}
	if (action) {
		return describeAction(event.kind === 'action', action);
	}
	if (error) {
		return {
			label: 'Error',
			title: error.message ? `${error.type}: ${error.message}` : error.type,
			detail: error.source,
			tone: 'error',
		};
	}
	if (vital) {
		return {
			label: 'Vital',
			title: `${vital.name.toUpperCase()} ${formatVital(vital.name, vital.value)}`,
			detail: RATING_LABELS[vital.rating] ?? vital.rating,
			tone: RATING_TONES[vital.rating] ?? 'neutral',
		};
	}
	return { label: 'Event', title: event.kind, detail: '', tone: 'neutral' };
}

/** Stable enough for a list key: events rarely share kind, time and target. */
export function eventKey(event: RumtypesTimelineEventDTO): string {
	const identity =
		event.request?.spanId ??
		event.error?.fingerprint ??
		event.action?.target ??
		event.vital?.name ??
		'';
	return `${event.kind}|${event.timestamp}|${identity}`;
}
