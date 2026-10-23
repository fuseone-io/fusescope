import type {
	RumtypesSessionViewDTO,
	RumtypesTimelineEventDTO,
} from 'api/generated/services/fuseScope.schemas';
import RatingChip from 'components/Rum/RatingChip';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { formatMs, formatTimeOnView, plural } from 'lib/rum/format';
import { formatVital } from 'lib/rum/vitals';
import { ChevronRight } from 'lucide-react';
import { cn } from 'lib/utils';

import { EventKindFilter, EventLink } from '../types';
import {
	eventKey,
	matchesKind,
	requestBars,
	sessionClock,
	viewSummary,
	waterfallSpanMs,
} from '../utils';
import RequestWaterfall from './RequestWaterfall';
import TimelineEventRow from './TimelineEventRow';

interface TimelineViewItemProps {
	view: RumtypesSessionViewDTO;
	sessionStart: number;
	kind: EventKindFilter;
	expanded: boolean;
	onToggle: (spanId: string) => void;
	eventLink: (event: RumtypesTimelineEventDTO) => EventLink | undefined;
}

const LOADING_LABELS: Record<string, string> = {
	initial_load: 'Page load',
	route_change: 'Route change',
	unknown: 'View',
};

function TimelineViewItem({
	view,
	sessionStart,
	kind,
	expanded,
	onToggle,
	eventLink,
}: TimelineViewItemProps): JSX.Element {
	const summary = viewSummary(view);
	const open = expanded && kind !== 'views';
	const events = (view.events ?? []).filter((event) => matchesKind(event, kind));
	const bars = requestBars(view);
	const showWaterfall =
		bars.length > 0 && (kind === 'all' || kind === 'requests');

	return (
		<li
			id={`rum-view-${view.spanId}`}
			data-testid="rum-session-view"
			className="tw:scroll-mt-4 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised"
		>
			<button
				type="button"
				aria-expanded={open}
				onClick={(): void => onToggle(view.spanId)}
				data-testid="rum-session-view-toggle"
				className="tw:grid tw:w-full tw:cursor-pointer tw:grid-cols-[56px_minmax(0,1fr)_auto_16px] tw:items-center tw:gap-3 tw:border-0 tw:bg-transparent tw:px-3 tw:py-2.5 tw:text-left tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none"
			>
				<span className="tw:font-mono tw:text-xs tw:text-subtle-foreground tw:tabular-nums">
					{sessionClock(Date.parse(view.timestamp) - sessionStart)}
				</span>
				<span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
					<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
						<span className="tw:font-mono tw:text-[13px] tw:font-medium">
							{view.route}
						</span>
						<StatusBadge
							tone={view.loadingType === 'initial_load' ? 'info' : 'neutral'}
						>
							{LOADING_LABELS[view.loadingType] ?? 'View'}
						</StatusBadge>
						{summary.lcp && (
							<span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:tabular-nums">
								LCP {formatVital('lcp', summary.lcp.value)}
								<RatingChip vital="lcp" value={summary.lcp.value} />
							</span>
						)}
					</span>
					<span className="tw:truncate tw:text-xs tw:text-muted-foreground">
						<span className="tw:font-mono">{view.path}</span> · {summary.requests}{' '}
						{plural(summary.requests, 'request')} · {summary.actions}{' '}
						{plural(summary.actions, 'action')}
					</span>
				</span>
				<span className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:tabular-nums">
					{summary.errors > 0 && (
						<StatusBadge tone="error" dot>
							{summary.errors} {plural(summary.errors, 'error')}
						</StatusBadge>
					)}
					<span className="tw:text-muted-foreground">
						{formatTimeOnView(view.durationMs)}
					</span>
				</span>
				<ChevronRight
					aria-hidden="true"
					className={cn(
						'tw:size-4 tw:text-muted-foreground tw:transition-transform',
						open && 'tw:rotate-90',
					)}
				/>
			</button>
			{open && (
				<div className="tw:flex tw:flex-col tw:gap-2 tw:border-t tw:border-border tw:px-3 tw:py-2.5">
					{showWaterfall && (
						<RequestWaterfall
							bars={bars}
							spanLabel={formatMs(waterfallSpanMs(view))}
						/>
					)}
					<ol
						aria-label={`Events on ${view.route}`}
						className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:p-0"
					>
						{events.map((event) => (
							<TimelineEventRow
								key={eventKey(event)}
								event={event}
								sessionStart={sessionStart}
								link={eventLink(event)}
							/>
						))}
					</ol>
					{events.length === 0 && (
						<span className="tw:px-2 tw:text-xs tw:text-subtle-foreground">
							Nothing of this kind on this view.
						</span>
					)}
				</div>
			)}
		</li>
	);
}

export default TimelineViewItem;
