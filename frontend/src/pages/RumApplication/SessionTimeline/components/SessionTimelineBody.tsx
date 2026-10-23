import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type {
	RumtypesGettableSessionDTO,
	RumtypesTimelineEventDTO,
} from 'api/generated/services/fuseScope.schemas';
import { ApmWindow } from 'lib/apm/window';
import { logsExplorerUrl, rumErrorUrl, traceDetailUrl } from 'lib/rum/links';
import { TriangleAlert } from 'lucide-react';

import { EventKindFilter, EventLink } from '../types';
import {
	defaultExpanded,
	eventKey,
	kindCounts,
	matchesKind,
	sessionFilter,
	timelineViews,
	viewStrip,
} from '../utils';
import { carriedSearch } from '../../utils';
import TimelineEventRow from './TimelineEventRow';
import TimelineHeader from './TimelineHeader';
import TimelineKpis from './TimelineKpis';
import TimelineToolbar from './TimelineToolbar';
import TimelineViewItem from './TimelineViewItem';
import ViewStripBar from './ViewStripBar';

interface SessionTimelineBodyProps {
	applicationId: string;
	session: RumtypesGettableSessionDTO;
	window: ApmWindow;
}

function SessionTimelineBody({
	applicationId,
	session,
	window,
}: SessionTimelineBodyProps): JSX.Element {
	const { search } = useLocation();
	const views = timelineViews(session);
	const [expanded, setExpanded] = useState(() => defaultExpanded(session));
	const [kind, setKind] = useState<EventKindFilter>('all');
	const counts = useMemo(() => kindCounts(session), [session]);
	const strip = useMemo(() => viewStrip(session), [session]);
	const sessionStart = Date.parse(session.startedAt);
	const leading = (session.leadingEvents ?? []).filter((event) =>
		matchesKind(event, kind),
	);

	const toggle = (spanId: string): void =>
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(spanId)) {
				next.delete(spanId);
			} else {
				next.add(spanId);
			}
			return next;
		});
	const jumpTo = (spanId: string): void => {
		setExpanded((current) => new Set(current).add(spanId));
		if (kind === 'views') {
			setKind('all');
		}
		document
			.getElementById(`rum-view-${spanId}`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};
	const eventLink = (event: RumtypesTimelineEventDTO): EventLink | undefined => {
		if (event.request?.traceId) {
			return {
				to: traceDetailUrl(event.request.traceId, event.request.spanId),
				label: event.request.hasBackend ? 'View backend trace' : 'Trace',
			};
		}
		if (event.error) {
			const logs = logsExplorerUrl(
				sessionFilter(applicationId, session.sessionId, event.error),
				window,
			);
			return event.error.fingerprint
				? {
						to: `${rumErrorUrl(applicationId, event.error.fingerprint)}${carriedSearch(search)}`,
						label: 'View error',
						secondary: { to: logs, label: 'View in Logs' },
					}
				: { to: logs, label: 'View in Logs' };
		}
		return undefined;
	};

	return (
		<section
			data-testid="rum-session-timeline"
			aria-label="Session timeline"
			className="tw:flex tw:flex-col tw:gap-4 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-5 tw:py-4"
		>
			<TimelineHeader
				applicationId={applicationId}
				session={session}
				window={window}
			/>
			<TimelineKpis session={session} />
			{session.truncated && (
				<p
					data-testid="rum-session-truncated"
					className="tw:m-0 tw:flex tw:items-start tw:gap-2 tw:rounded-md tw:bg-warning-soft tw:px-3 tw:py-2 tw:text-xs tw:text-warning-ink"
				>
					<TriangleAlert
						aria-hidden="true"
						className="tw:mt-px tw:size-3.5 tw:flex-none"
					/>
					This session has more events than one page holds, so the timeline stops
					early. Its logs and traces have the rest.
				</p>
			)}
			<ViewStripBar
				strip={strip}
				durationMs={session.durationMs}
				onPick={jumpTo}
			/>
			<TimelineToolbar
				kind={kind}
				counts={counts}
				onKindChange={setKind}
				onExpandAll={(): void =>
					setExpanded(new Set(views.map((view) => view.spanId)))
				}
				onCollapseAll={(): void => setExpanded(new Set())}
			/>
			{leading.length > 0 && kind !== 'views' && (
				<div className="tw:flex tw:flex-col tw:gap-1 tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:px-3 tw:py-2">
					<span className="tw:text-xs tw:text-muted-foreground">
						Before the first view
					</span>
					<ol className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:p-0">
						{leading.map((event) => (
							<TimelineEventRow
								key={eventKey(event)}
								event={event}
								sessionStart={sessionStart}
								link={eventLink(event)}
							/>
						))}
					</ol>
				</div>
			)}
			<ol
				aria-label="Views"
				className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0"
			>
				{views.map((view) => (
					<TimelineViewItem
						key={view.spanId}
						view={view}
						sessionStart={sessionStart}
						kind={kind}
						expanded={expanded.has(view.spanId)}
						onToggle={toggle}
						eventLink={eventLink}
					/>
				))}
			</ol>
			{views.length === 0 && (
				<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
					No views were recorded for this session.
				</p>
			)}
			<p className="tw:m-0 tw:text-xs tw:text-subtle-foreground">
				Every request carries <span className="tw:font-mono">traceparent</span>, so
				its trace opens the backend spans it caused. No replay: inputs and page text
				are never captured.
			</p>
		</section>
	);
}

export default SessionTimelineBody;
