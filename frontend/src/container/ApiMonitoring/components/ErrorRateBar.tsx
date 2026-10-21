import { formatPercent } from 'lib/apm/format';
import { cn } from 'lib/utils';

import { errorRateTone, ErrorRateTone } from '../domainList';

const BAR_TONE: Record<ErrorRateTone, string> = {
	success: 'tw:bg-success',
	warning: 'tw:bg-warning',
	error: 'tw:bg-error',
};

interface ErrorRateBarProps {
	/** Percent, 0–100; undefined when the API had no value. */
	value: number | undefined;
	className?: string;
}

/** Error share as a bar and a number: green at 0, amber above, red from 5%. */
function ErrorRateBar({ value, className }: ErrorRateBarProps): JSX.Element {
	const percent = value ?? 0;
	const tone = errorRateTone(percent);
	const width = percent > 0 ? Math.max(2, Math.min(100, percent)) : 0;
	return (
		<span
			data-testid="error-rate-bar"
			data-tone={tone}
			className={cn('tw:flex tw:min-w-0 tw:items-center tw:gap-2.5', className)}
		>
			<span
				aria-hidden="true"
				className="tw:block tw:h-1.5 tw:min-w-10 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-muted"
			>
				<span
					className={cn('tw:block tw:h-full tw:rounded-full', BAR_TONE[tone])}
					style={{ width: `${width}%` }}
				/>
			</span>
			<span
				className={cn(
					'tw:min-w-12 tw:text-right tw:text-[13px] tw:tabular-nums',
					tone === 'error' && 'tw:font-semibold tw:text-error-ink',
					tone === 'warning' && 'tw:text-warning-ink',
					tone === 'success' && 'tw:text-success-ink',
				)}
			>
				{formatPercent(value)}
			</span>
		</span>
	);
}

export default ErrorRateBar;
