import StatusBadge from 'components/PageTemplate/components/StatusBadge';

import type { SignalSummary } from '../../types';

interface SignalStatusStripProps {
	signals: SignalSummary[];
}

/** Traces, metrics and logs: received in the window or not yet. */
function SignalStatusStrip({ signals }: SignalStatusStripProps): JSX.Element {
	return (
		<ul
			aria-label="Signals received in the last hour"
			className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] tw:gap-2"
		>
			{signals.map((signal) => (
				<li
					key={signal.key}
					data-testid={`signal-status-${signal.key}`}
					data-received={signal.received}
					className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5 tw:rounded-lg tw:border tw:border-border tw:px-3 tw:py-2"
				>
					<StatusBadge tone={signal.received ? 'success' : 'neutral'} dot>
						{signal.received ? 'Receiving' : 'No data yet'}
					</StatusBadge>
					<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
						<span className="tw:text-[13px] tw:font-medium">{signal.name}</span>
						<span className="tw:text-xs tw:text-subtle-foreground tw:tabular-nums">
							{signal.detail}
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}

export default SignalStatusStrip;
