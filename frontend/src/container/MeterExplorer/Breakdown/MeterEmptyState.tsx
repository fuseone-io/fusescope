import { Button } from 'components/ui/button';
import { ChartColumn } from 'lucide-react';

/** The range has no hourly meter samples. */
function MeterEmptyState({
	onShowLastWeek,
}: {
	onShowLastWeek: () => void;
}): JSX.Element {
	return (
		<section
			aria-label="No meter data"
			data-testid="meter-empty"
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:py-12 tw:text-center tw:font-sans"
		>
			<span
				aria-hidden="true"
				className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-xl tw:bg-primary-soft tw:text-primary-ink"
			>
				<ChartColumn className="tw:size-6" />
			</span>
			<h2 className="tw:text-base tw:font-semibold">
				No usage recorded for this range
			</h2>
			<p className="tw:max-w-[520px] tw:text-[13px] tw:text-muted-foreground">
				Meter data is written once per hour from what the collector ingests. Pick a
				range that covers at least one full hour, or check back after the first hour
				of ingestion.
			</p>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={onShowLastWeek}
				data-testid="meter-show-last-week"
			>
				Show the last 7 days
			</Button>
		</section>
	);
}

export default MeterEmptyState;
