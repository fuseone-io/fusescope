import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { cn } from 'lib/utils';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { pageItems } from '../pagination';

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

interface NumberedTablePaginationProps {
	/** 1-based. */
	page: number;
	pageSize: number;
	total: number;
	onChange: (page: number, pageSize: number) => void;
	/** Plural noun after the total, e.g. "exceptions". */
	itemLabel?: string;
	pageSizes?: number[];
	className?: string;
}

/**
 * Server-side paging: the visible range, numbered pages with prev/next and a
 * page-size menu. A new page size goes back to the first page.
 */
function NumberedTablePagination({
	page,
	pageSize,
	total,
	onChange,
	itemLabel = 'items',
	pageSizes = DEFAULT_PAGE_SIZES,
	className,
}: NumberedTablePaginationProps): JSX.Element {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const current = Math.min(Math.max(page, 1), pageCount);
	const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
	const last = Math.min(current * pageSize, total);

	return (
		<nav
			aria-label="Pagination"
			className={cn(
				'fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-t tw:border-border tw:px-4 tw:py-2.5 tw:font-sans tw:text-xs tw:text-subtle-foreground',
				className,
			)}
		>
			<span className="tw:tabular-nums">
				{`Showing ${first}–${last} of ${total} ${itemLabel}`}
			</span>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Previous page"
					data-testid="pagination-previous"
					disabled={current === 1}
					onClick={(): void => onChange(current - 1, pageSize)}
				>
					<ChevronLeft />
				</Button>
				{pageItems(current, pageCount).map((item) =>
					typeof item === 'number' ? (
						<Button
							key={item}
							variant={item === current ? 'outline' : 'ghost'}
							size="sm"
							aria-current={item === current ? 'page' : undefined}
							data-testid={`pagination-page-${item}`}
							className={cn(
								'tw:min-w-8 tw:px-2 tw:tabular-nums',
								item === current && 'tw:border-primary tw:text-primary!',
							)}
							onClick={(): void => onChange(item, pageSize)}
						>
							{item}
						</Button>
					) : (
						<span key={item} aria-hidden="true" className="tw:px-1">
							…
						</span>
					),
				)}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Next page"
					data-testid="pagination-next"
					disabled={current === pageCount}
					onClick={(): void => onChange(current + 1, pageSize)}
				>
					<ChevronRight />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							data-testid="pagination-page-size"
							className="tw:ml-2 tw:font-normal tw:tabular-nums"
						>
							{`${pageSize} / page`}
							<ChevronDown />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuRadioGroup
							value={String(pageSize)}
							onValueChange={(value): void => onChange(1, Number(value))}
						>
							{pageSizes.map((size) => (
								<DropdownMenuRadioItem
									key={size}
									value={String(size)}
									data-testid={`pagination-page-size-${size}`}
								>
									{`${size} / page`}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</nav>
	);
}

export default NumberedTablePagination;
