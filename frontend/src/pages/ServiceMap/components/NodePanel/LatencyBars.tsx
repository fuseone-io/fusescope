import { formatLatencyMs } from 'lib/apm/format';
import { cn } from 'lib/utils';

import { Percentiles } from '../../utils/requests';
import { latencyTone } from '../../utils/health';

interface LatencyBarsProps {
	latency: Percentiles;
}

const BAR: Record<string, string> = {
	success: 'tw:bg-primary',
	neutral: 'tw:bg-primary',
	warning: 'tw:bg-warning',
	error: 'tw:bg-error',
};

/** p50, p95 and p99 as bars against p99. */
function LatencyBars({ latency }: LatencyBarsProps): JSX.Element {
	const max = latency.p99 || latency.p95 || latency.p50 || 1;
	const rows: [string, number | undefined][] = [
		['p50', latency.p50],
		['p95', latency.p95],
		['p99', latency.p99],
	];
	return (
		<div className="tw:flex tw:flex-col tw:gap-1.5">
			{rows.map(([label, value]) => (
				<div
					key={label}
					className="tw:grid tw:grid-cols-[32px_minmax(0,1fr)_64px] tw:items-center tw:gap-2 tw:text-xs"
				>
					<span className="tw:text-muted-foreground">{label}</span>
					<span className="tw:block tw:h-1.5 tw:overflow-hidden tw:rounded-full tw:bg-muted">
						<span
							className={cn(
								'tw:block tw:h-full tw:rounded-full',
								BAR[latencyTone(value)],
							)}
							style={{
								width: `${Math.max(4, Math.min(100, ((value ?? 0) / max) * 100))}%`,
							}}
						/>
					</span>
					<span className="tw:text-right tw:font-medium tw:tabular-nums">
						{formatLatencyMs(value)}
					</span>
				</div>
			))}
		</div>
	);
}

export default LatencyBars;
