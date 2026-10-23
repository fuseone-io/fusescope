import { Link } from 'react-router-dom';
import type { RumtypesTimelineEventDTO } from 'api/generated/services/fuseScope.schemas';
import HttpStatusCodeBadge from 'components/PageTemplate/components/HttpStatusCodeBadge';
import { formatMs } from 'lib/rum/format';
import { cn } from 'lib/utils';
import { ArrowUpRight } from 'lucide-react';

import { EventLink, EventTone } from '../types';
import { describeEvent, sessionClock } from '../utils';

interface TimelineEventRowProps {
	event: RumtypesTimelineEventDTO;
	/** Epoch ms of the session start. */
	sessionStart: number;
	/** The event's page elsewhere: the trace of a request, the group of an error. */
	link?: EventLink;
}

const TONES: Record<EventTone, string> = {
	neutral: 'tw:bg-muted tw:text-muted-foreground',
	action: 'tw:bg-brand-secondary-soft tw:text-brand-secondary-ink',
	error: 'tw:bg-error-soft tw:text-error-ink',
	success: 'tw:bg-success-soft tw:text-success-ink',
	warning: 'tw:bg-warning-soft tw:text-warning-ink',
};

function TimelineEventRow({
	event,
	sessionStart,
	link,
}: TimelineEventRowProps): JSX.Element {
	const description = describeEvent(event);
	const { request } = event;
	const bad = description.tone === 'error' && description.label !== 'Vital';
	return (
		<li
			data-testid="rum-session-event"
			data-kind={event.kind}
			className={cn(
				'tw:grid tw:grid-cols-[56px_76px_minmax(0,1fr)_auto_minmax(0,200px)] tw:items-center tw:gap-3 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs',
				bad && 'tw:bg-error-soft/60',
			)}
		>
			<span className="tw:font-mono tw:text-subtle-foreground tw:tabular-nums">
				{sessionClock(Date.parse(event.timestamp) - sessionStart)}
			</span>
			<span
				className={cn(
					'tw:inline-flex tw:h-5 tw:w-fit tw:items-center tw:rounded-sm tw:px-1.5 tw:text-[11px] tw:font-medium',
					TONES[description.tone],
				)}
			>
				{description.label}
			</span>
			<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
				<span
					title={request?.url || description.title}
					className={cn(
						'tw:truncate tw:font-mono',
						bad ? 'tw:font-medium tw:text-error-ink' : 'tw:text-foreground',
					)}
				>
					{description.title}
				</span>
				{description.detail && (
					<span className="tw:truncate tw:text-[11px] tw:text-subtle-foreground">
						{description.detail}
					</span>
				)}
			</span>
			<span className="tw:flex tw:items-center tw:gap-2 tw:tabular-nums">
				{request && (
					<>
						{request.statusCode > 0 ? (
							<HttpStatusCodeBadge statusCode={request.statusCode} />
						) : (
							<span className="tw:text-error-ink">no response</span>
						)}
						<span className="tw:w-14 tw:text-right tw:text-muted-foreground">
							{formatMs(request.durationMs)}
						</span>
					</>
				)}
			</span>
			<span className="tw:flex tw:items-center tw:justify-end tw:gap-2">
				{link?.secondary && (
					<Link
						to={link.secondary.to}
						data-testid={`rum-session-event-${event.kind}-logs`}
						className="tw:whitespace-nowrap tw:text-muted-foreground! tw:hover:text-foreground! tw:hover:underline"
					>
						{link.secondary.label}
					</Link>
				)}
				{link && (
					<Link
						to={link.to}
						data-testid={`rum-session-event-${event.kind}-link`}
						className="tw:inline-flex tw:items-center tw:gap-1 tw:font-medium tw:whitespace-nowrap tw:text-primary! tw:hover:underline"
					>
						{link.label}
						<ArrowUpRight aria-hidden="true" className="tw:size-3.5" />
					</Link>
				)}
			</span>
		</li>
	);
}

export default TimelineEventRow;
