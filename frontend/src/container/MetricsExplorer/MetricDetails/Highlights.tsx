import { ReactNode } from 'react';
import { Tooltip } from '@signozhq/ui/tooltip';
import { useGetMetricHighlights } from 'api/generated/services/metrics';
import { Button } from 'components/ui/button';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { Info, Loader2 } from 'lucide-react';
import { useTimezone } from 'providers/Timezone';

import { formatNumberIntoHumanReadableFormat } from '../Summary/utils';
import { HighlightsProps } from './types';
import {
	formatNumberToCompactFormat,
	formatTimestampToReadableDate,
} from './utils';

const LABELS = ['Samples', 'Time series', 'Last received'];

function StatCell({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}): JSX.Element {
	return (
		<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:bg-surface-raised tw:px-3.5 tw:py-3">
			<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
				{label}
			</span>
			{children}
		</div>
	);
}

const STRIP_CLASS =
	'fs-ui tw:grid tw:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] tw:gap-px tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-border tw:font-sans tw:text-foreground';
const VALUE_CLASS = 'tw:text-xl tw:font-semibold tw:tabular-nums';

function Highlights({ metricName }: HighlightsProps): JSX.Element {
	const {
		data: metricHighlightsData,
		isLoading: isLoadingMetricHighlights,
		isError: isErrorMetricHighlights,
		refetch: refetchMetricHighlights,
	} = useGetMetricHighlights(
		{
			metricName,
		},
		{
			query: {
				enabled: !!metricName,
			},
		},
	);

	const metricHighlights = metricHighlightsData?.data;

	const timeSeriesActive = formatNumberToCompactFormat(
		metricHighlights?.activeTimeSeries,
	);
	const timeSeriesTotal = formatNumberToCompactFormat(
		metricHighlights?.totalTimeSeries,
	);
	const lastReceivedText = formatTimestampToReadableDate(
		metricHighlights?.lastReceived,
	);
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const lastReceivedTooltipText = metricHighlights?.lastReceived
		? `Last received on ${formatTimezoneAdjustedTimestamp(
				metricHighlights.lastReceived,
				DATE_TIME_FORMATS.DASH_DATETIME_UTC,
			)}`
		: 'No data received yet';

	if (isErrorMetricHighlights) {
		return (
			<div
				className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3 tw:font-sans tw:text-[13px] tw:text-foreground"
				data-testid="metric-highlights-error-state"
			>
				<Info aria-hidden="true" className="tw:size-4 tw:text-error" />
				Something went wrong while fetching metric highlights
				<Button
					variant="link"
					size="sm"
					className="tw:h-auto tw:px-1"
					onClick={(): void => {
						void refetchMetricHighlights();
					}}
				>
					Retry
				</Button>
			</div>
		);
	}

	if (isLoadingMetricHighlights) {
		return (
			<div className={STRIP_CLASS}>
				{LABELS.map((label, index) => (
					<StatCell key={label} label={label}>
						{index === 0 ? (
							<span className="tw:inline-flex tw:items-center tw:gap-2 tw:text-[13px] tw:text-muted-foreground">
								<Loader2 aria-hidden="true" className="tw:size-4 tw:animate-spin" />
								Loading metric stats
							</span>
						) : (
							<span className={`${VALUE_CLASS} tw:text-subtle-foreground`}>-</span>
						)}
					</StatCell>
				))}
			</div>
		);
	}

	return (
		<div className={STRIP_CLASS}>
			<StatCell label={LABELS[0]}>
				<Tooltip title={metricHighlights?.dataPoints?.toLocaleString()}>
					<span className={VALUE_CLASS} data-testid="metric-highlights-data-points">
						{formatNumberIntoHumanReadableFormat(metricHighlights?.dataPoints ?? 0)}
					</span>
				</Tooltip>
			</StatCell>
			<StatCell label={LABELS[1]}>
				<span
					className={VALUE_CLASS}
					data-testid="metric-highlights-time-series-total"
				>
					{timeSeriesTotal}
					<span className="tw:text-[13px] tw:font-normal tw:text-muted-foreground">
						{` total — ${timeSeriesActive} active`}
					</span>
				</span>
				<span className="tw:text-[11px] tw:text-subtle-foreground">
					Active: received data in the last hour
				</span>
			</StatCell>
			<StatCell label={LABELS[2]}>
				<Tooltip title={lastReceivedTooltipText}>
					<span
						className="tw:text-xl tw:font-semibold"
						data-testid="metric-highlights-last-received"
					>
						{lastReceivedText}
					</span>
				</Tooltip>
			</StatCell>
		</div>
	);
}

export default Highlights;
