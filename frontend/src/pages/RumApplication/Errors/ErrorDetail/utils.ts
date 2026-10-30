import type {
	RumtypesErrorEventDTO,
	RumtypesTimelineEventDTO,
} from 'api/generated/services/fuseScope.schemas';
import { RumtypesTimelineEventKindDTO } from 'api/generated/services/fuseScope.schemas';

import { EventDescription } from '../../SessionTimeline/types';
import { describeEvent, sessionClock } from '../../SessionTimeline/utils';

/** The selected event's breadcrumbs, then the error itself. */
export function breadcrumbItems(
	breadcrumbs: RumtypesTimelineEventDTO[] | null,
	event: RumtypesErrorEventDTO,
	fingerprint: string,
): RumtypesTimelineEventDTO[] {
	return [
		...(breadcrumbs ?? []),
		{
			kind: RumtypesTimelineEventKindDTO.error,
			timestamp: event.timestamp,
			route: event.route,
			error: {
				fingerprint,
				type: event.type,
				message: event.message,
				source: event.source,
			},
		},
	];
}

/** "−1:27.3" before the error, "0:00.0" at it. */
export function beforeError(at: string, errorAt: string): string {
	const ms = Date.parse(errorAt) - Date.parse(at);
	const clock = sessionClock(ms);
	return ms >= 50 ? `−${clock}` : clock;
}

export function topClient(
	events: RumtypesErrorEventDTO[],
	jvm = false,
): { label: string; share: string } | undefined {
	const counts = new Map<string, number>();
	events.forEach(({ client }) => {
		const label = jvm
			? client.device
			: client.browser
				? [client.browser, client.browserVersion].filter(Boolean).join(' ')
				: '';
		if (label) {
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}
	});
	const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
	if (!top) {
		return undefined;
	}
	return {
		label: top[0],
		share: `${Math.round((top[1] / events.length) * 100)}% of latest events`,
	};
}

/** Where the selected event sits among the latest, newest first. */
export function eventPosition(
	events: RumtypesErrorEventDTO[],
	selectedId: string,
): { index: number; newer?: string; older?: string } {
	const index = Math.max(
		0,
		events.findIndex((event) => event.id === selectedId),
	);
	return {
		index,
		newer: events[index - 1]?.id,
		older: events[index + 1]?.id,
	};
}

const LOADING_LABELS: Record<string, string> = {
	initial_load: 'page load',
	route_change: 'SPA navigation',
};

/** A breadcrumb's row: views by route, the rest as the session timeline says them. */
export function describeBreadcrumb(
	event: RumtypesTimelineEventDTO,
): EventDescription {
	if (event.view) {
		const loading = LOADING_LABELS[event.view.loadingType];
		return {
			label: 'View',
			title: event.route || event.view.path,
			detail: [event.view.path, loading].filter(Boolean).join(' · '),
			tone: 'neutral',
		};
	}
	return describeEvent(event);
}
