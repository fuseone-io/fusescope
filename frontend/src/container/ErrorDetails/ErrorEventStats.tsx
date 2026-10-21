import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from 'components/ui/skeleton';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { formatCount } from 'lib/apm/format';
import { useTimezone } from 'providers/Timezone';
import { Exception } from 'types/api/errors/getAll';
import { PayloadProps as ErrorEvent } from 'types/api/errors/getByErrorTypeAndService';

import { traceUrl } from './utils';

interface ErrorEventStatsProps {
	event: ErrorEvent;
	group: Exception | undefined;
	isGroupLoading: boolean;
}

interface StatProps {
	label: string;
	hint?: string;
	children: ReactNode;
	testId: string;
}

function Stat({ label, hint, children, testId }: StatProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5 tw:bg-surface-raised tw:px-5 tw:py-3"
		>
			<span
				title={hint}
				className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
			>
				{label}
			</span>
			{children}
		</div>
	);
}

/** Group totals in the selected range, then this event's trace. */
function ErrorEventStats({
	event,
	group,
	isGroupLoading,
}: ErrorEventStatsProps): JSX.Element {
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const format = (value: string): string =>
		formatTimezoneAdjustedTimestamp(
			value,
			DATE_TIME_FORMATS.DD_MMM_YYYY_HH_MM_SS,
		);
	const groupValue = (value: (row: Exception) => string): ReactNode => {
		if (isGroupLoading) {
			return <Skeleton className="tw:mt-1 tw:h-4 tw:w-24 tw:bg-muted" />;
		}
		return group ? value(group) : '—';
	};
	const rangeHint =
		'In the selected time range, extended to this event when it falls outside';

	return (
		<div className="fs-ui tw:grid tw:font-sans tw:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] tw:gap-px tw:border-b tw:border-border tw:bg-border">
			<Stat label="Events" hint={rangeHint} testId="error-stat-count">
				<span className="tw:text-xl tw:font-semibold tw:tabular-nums">
					{groupValue((row) => formatCount(row.exceptionCount))}
				</span>
			</Stat>
			<Stat label="Last seen" hint={rangeHint} testId="error-stat-last-seen">
				<span className="tw:text-[13px] tw:font-medium tw:tabular-nums">
					{groupValue((row) => format(row.lastSeen))}
				</span>
			</Stat>
			<Stat label="First seen" hint={rangeHint} testId="error-stat-first-seen">
				<span className="tw:text-[13px] tw:font-medium tw:tabular-nums">
					{groupValue((row) => format(row.firstSeen))}
				</span>
			</Stat>
			<Stat label="Trace ID" testId="error-stat-trace">
				<Link
					to={traceUrl(event.traceID, event.spanID)}
					title={event.traceID}
					className="tw:truncate tw:font-mono tw:text-xs tw:text-primary! tw:hover:underline"
				>
					{event.traceID}
				</Link>
			</Stat>
		</div>
	);
}

export default ErrorEventStats;
