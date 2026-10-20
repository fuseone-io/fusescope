import { ChartColumn } from 'lucide-react';

interface EmptyMetricsSearchProps {
	hasQueryResult?: boolean;
}

export default function EmptyMetricsSearch({
	hasQueryResult,
}: EmptyMetricsSearchProps): JSX.Element {
	return (
		<div className="empty-metrics-search fs-ui tw:flex tw:min-h-[240px] tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-sm tw:text-muted-foreground">
			<span
				aria-hidden="true"
				className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-[10px] tw:bg-primary-soft tw:text-primary-ink"
			>
				<ChartColumn className="tw:size-5" />
			</span>
			<p className="tw:font-medium tw:text-foreground">
				{hasQueryResult
					? 'No data'
					: 'Select a metric and run a query to see the results'}
			</p>
		</div>
	);
}
