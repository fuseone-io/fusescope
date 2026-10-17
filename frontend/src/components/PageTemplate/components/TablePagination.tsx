import { Button } from 'components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TablePaginationProps {
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
}

/** Previous/next with the visible range; renders nothing for a single page. */
function TablePagination({
	page,
	pageSize,
	total,
	onPageChange,
}: TablePaginationProps): JSX.Element | null {
	const pageCount = Math.ceil(total / pageSize);
	if (pageCount <= 1) {
		return null;
	}

	const current = Math.min(Math.max(page, 1), pageCount);
	const first = (current - 1) * pageSize + 1;
	const last = Math.min(current * pageSize, total);

	return (
		<nav
			aria-label="Pagination"
			className="fs-ui tw:flex tw:items-center tw:justify-end tw:gap-3 tw:border-t tw:border-border tw:px-5 tw:py-2.5 tw:font-sans tw:text-xs tw:text-muted-foreground"
		>
			<span className="tw:tabular-nums">{`${first}-${last} of ${total} items`}</span>
			<div className="tw:flex tw:gap-1">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Previous page"
					data-testid="pagination-previous"
					disabled={current === 1}
					onClick={(): void => onPageChange(current - 1)}
				>
					<ChevronLeft />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Next page"
					data-testid="pagination-next"
					disabled={current === pageCount}
					onClick={(): void => onPageChange(current + 1)}
				>
					<ChevronRight />
				</Button>
			</div>
		</nav>
	);
}

export default TablePagination;
