import { cn } from 'lib/utils';

import { ViewStrip } from '../types';
import { sessionClock } from '../utils';

interface ViewStripBarProps {
	strip: ViewStrip;
	durationMs: number;
	onPick: (spanId: string) => void;
}

const AXIS_LABELS = 6;
/** Segments narrower than this many percent show no route. */
const LABEL_MIN_WIDTH = 10;

/** The session's views side by side, with its actions and errors as ticks. */
function ViewStripBar({
	strip,
	durationMs,
	onPick,
}: ViewStripBarProps): JSX.Element {
	return (
		<div
			data-testid="rum-session-strip"
			className="tw:flex tw:flex-col tw:gap-1.5"
		>
			<div className="tw:flex tw:items-center tw:justify-between tw:text-xs tw:text-muted-foreground">
				<span>Views</span>
				<span className="tw:flex tw:items-center tw:gap-3">
					<span className="tw:inline-flex tw:items-center tw:gap-1.5">
						<span
							aria-hidden="true"
							className="tw:h-2 tw:w-0.5 tw:bg-brand-secondary"
						/>
						action
					</span>
					<span className="tw:inline-flex tw:items-center tw:gap-1.5">
						<span
							aria-hidden="true"
							className="tw:size-2 tw:rounded-full tw:bg-error"
						/>
						error
					</span>
				</span>
			</div>
			<div
				role="group"
				aria-label="Views over the session, select one to jump to it"
				className="tw:relative tw:h-8 tw:overflow-hidden tw:rounded-md tw:bg-surface-sunken"
			>
				{strip.segments.map((segment, index) => (
					<button
						key={segment.spanId}
						type="button"
						onClick={(): void => onPick(segment.spanId)}
						title={`${sessionClock(segment.startMs)} ${segment.route}`}
						aria-label={`${sessionClock(segment.startMs)} ${segment.route}`}
						data-testid="rum-session-segment"
						className={cn(
							'tw:absolute tw:inset-y-0 tw:cursor-pointer tw:truncate tw:border-0 tw:border-r-2 tw:border-surface-raised tw:px-1.5 tw:text-left tw:font-mono tw:text-[11px] tw:text-foreground tw:hover:brightness-110 tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none',
							index % 2 ? 'tw:bg-primary/25' : 'tw:bg-primary/40',
						)}
						style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
					>
						{segment.width >= LABEL_MIN_WIDTH ? segment.route : ''}
					</button>
				))}
				{strip.errors.map((mark) => (
					<span
						key={`${mark.left}-${mark.title}`}
						title={mark.title}
						data-testid="rum-session-error-mark"
						className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:size-2.5 tw:-translate-1/2 tw:rounded-full tw:bg-error tw:ring-2 tw:ring-surface-raised"
						style={{ left: `${mark.left}%` }}
					/>
				))}
			</div>
			<div aria-hidden="true" className="tw:relative tw:h-2">
				{strip.actions.map((left) => (
					<span
						key={left}
						className="tw:absolute tw:top-0 tw:h-2 tw:w-0.5 tw:bg-brand-secondary"
						style={{ left: `${left}%` }}
					/>
				))}
			</div>
			<div className="tw:flex tw:justify-between tw:text-[11px] tw:text-subtle-foreground tw:tabular-nums">
				{Array.from({ length: AXIS_LABELS }, (_, index) => {
					const ms = (durationMs * index) / (AXIS_LABELS - 1);
					return (
						<span key={ms}>
							{sessionClock(Math.round(ms / 1000) * 1000).replace(/\.0$/, '')}
						</span>
					);
				})}
			</div>
		</div>
	);
}

export default ViewStripBar;
