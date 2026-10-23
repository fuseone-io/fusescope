import { formatMs } from 'lib/rum/format';
import { cn } from 'lib/utils';

import { RequestBar } from '../types';

interface RequestWaterfallProps {
	bars: RequestBar[];
	spanLabel: string;
}

/** The view's requests on a shared time axis from the view start. */
function RequestWaterfall({
	bars,
	spanLabel,
}: RequestWaterfallProps): JSX.Element {
	return (
		<div
			data-testid="rum-session-waterfall"
			className="tw:flex tw:flex-col tw:gap-1 tw:rounded-md tw:border tw:border-border tw:bg-surface-sunken/50 tw:px-3 tw:py-2"
		>
			<div className="tw:grid tw:grid-cols-[minmax(0,34%)_minmax(0,1fr)_64px] tw:gap-3 tw:text-[11px] tw:text-subtle-foreground">
				<span>Requests on this view</span>
				<span className="tw:flex tw:justify-between tw:tabular-nums">
					<span>0</span>
					<span>{spanLabel}</span>
				</span>
				<span className="tw:text-right">Duration</span>
			</div>
			{bars.map((bar) => (
				<div
					key={bar.spanId}
					className="tw:grid tw:grid-cols-[minmax(0,34%)_minmax(0,1fr)_64px] tw:items-center tw:gap-3 tw:text-xs"
				>
					<span
						title={bar.label}
						className={cn(
							'tw:truncate tw:font-mono',
							bar.failed && 'tw:text-error-ink',
						)}
					>
						{bar.label}
					</span>
					<span className="tw:relative tw:h-2">
						<span
							className={cn(
								'tw:absolute tw:inset-y-0 tw:min-w-0.5 tw:rounded-sm',
								bar.failed && 'tw:bg-error',
								!bar.failed && bar.slow && 'tw:bg-warning',
								!bar.failed && !bar.slow && 'tw:bg-primary',
							)}
							style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
						/>
					</span>
					<span
						className={cn(
							'tw:text-right tw:tabular-nums',
							bar.failed ? 'tw:text-error-ink' : 'tw:text-muted-foreground',
						)}
					>
						{formatMs(bar.durationMs)}
					</span>
				</div>
			))}
		</div>
	);
}

export default RequestWaterfall;
