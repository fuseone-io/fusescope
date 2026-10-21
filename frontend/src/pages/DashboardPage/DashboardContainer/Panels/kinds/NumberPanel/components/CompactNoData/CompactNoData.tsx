import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';

const FULL_MESSAGE = 'No data in this time range';

/** An empty KPI value: a dash and "No data", the full message on hover. */
function CompactNoData(): JSX.Element {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<div
						data-testid="number-panel-compact-no-data"
						aria-label={FULL_MESSAGE}
						tabIndex={0}
						className="fs-ui tw:flex tw:h-full tw:flex-col tw:items-center tw:justify-center tw:gap-0.5 tw:font-sans tw:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-ring"
					>
						<span className="tw:text-2xl tw:leading-none tw:font-semibold tw:text-muted-foreground">
							—
						</span>
						<span className="tw:text-xs tw:text-muted-foreground">No data</span>
					</div>
				</TooltipTrigger>
				<TooltipContent>{FULL_MESSAGE}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export default CompactNoData;
