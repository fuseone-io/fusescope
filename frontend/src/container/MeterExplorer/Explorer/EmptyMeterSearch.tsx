import { ChartColumn } from 'lucide-react';

interface EmptyMeterSearchProps {
	hasQueryResult?: boolean;
}

export default function EmptyMeterSearch({
	hasQueryResult,
}: EmptyMeterSearchProps): JSX.Element {
	return (
		<div
			data-testid="meter-explorer-empty"
			className="fs-ui tw:flex tw:h-full tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:font-sans tw:text-center"
		>
			<ChartColumn
				aria-hidden="true"
				className="tw:size-6 tw:text-subtle-foreground"
			/>
			<p className="tw:text-[13px] tw:text-muted-foreground">
				{hasQueryResult
					? 'No usage for this query in the range.'
					: 'Select a meter and run the query to see usage.'}
			</p>
		</div>
	);
}
