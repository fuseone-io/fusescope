import { Button } from 'components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TimelineFooterProps {
	start: number;
	end: number;
	total: number;
	hasPrevPage: boolean;
	hasNextPage: boolean;
	onPrevPage: () => void;
	onNextPage: () => void;
}

function TimelineFooter({
	start,
	end,
	total,
	hasPrevPage,
	hasNextPage,
	onPrevPage,
	onNextPage,
}: TimelineFooterProps): JSX.Element {
	return (
		<nav
			aria-label="Pagination"
			className="fs-ui tw:flex tw:items-center tw:justify-end tw:gap-3 tw:border-t tw:border-border tw:px-5 tw:py-2.5 tw:font-sans tw:text-xs tw:text-muted-foreground"
		>
			<span className="tw:tabular-nums" data-testid="timeline-footer-range">
				{start} &#8212; {end} of {total}
			</span>
			<div className="tw:flex tw:gap-1">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Previous page"
					disabled={!hasPrevPage}
					onClick={onPrevPage}
					data-testid="timeline-prev-page"
				>
					<ChevronLeft aria-hidden="true" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Next page"
					disabled={!hasNextPage}
					onClick={onNextPage}
					data-testid="timeline-next-page"
				>
					<ChevronRight aria-hidden="true" />
				</Button>
			</div>
		</nav>
	);
}

export default TimelineFooter;
