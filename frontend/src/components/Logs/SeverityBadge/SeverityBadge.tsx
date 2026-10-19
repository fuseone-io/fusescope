import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { StatusTone } from 'components/PageTemplate/types';

import { LogType } from '../LogStateIndicator/LogStateIndicator';

const SEVERITY_TONE: Record<string, StatusTone> = {
	[LogType.TRACE]: 'neutral',
	[LogType.DEBUG]: 'neutral',
	[LogType.INFO]: 'info',
	[LogType.WARN]: 'warning',
	[LogType.ERROR]: 'error',
};

interface SeverityBadgeProps {
	/** The log type from `getLogIndicatorType`. */
	logType: string;
	/** What the badge reads; the log's own severity text. */
	label: string;
	className?: string;
	testId?: string;
}

/** A log severity as a tone badge: errors red, warnings amber, info blue. */
function SeverityBadge({
	logType,
	label,
	className,
	testId,
}: SeverityBadgeProps): JSX.Element {
	if (logType === LogType.FATAL) {
		return (
			<StatusBadge
				tone="neutral"
				testId={testId}
				className={`tw:bg-brand-secondary-soft tw:text-brand-secondary-ink ${className ?? ''}`}
			>
				{label}
			</StatusBadge>
		);
	}

	return (
		<StatusBadge
			tone={SEVERITY_TONE[logType] ?? 'neutral'}
			testId={testId}
			className={className}
		>
			{label}
		</StatusBadge>
	);
}

export default SeverityBadge;
