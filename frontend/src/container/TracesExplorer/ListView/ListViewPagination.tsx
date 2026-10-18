import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import useQueryPagination from 'hooks/queryPagination/useQueryPagination';
import { ChevronDown } from 'lucide-react';

interface ListViewPaginationProps {
	/** Rows on the current page; the API returns no overall total. */
	pageCount: number;
	isLoading: boolean;
	perPageOptions: number[];
}

/** Offset paging under the spans list: visible range, previous/next and page size. */
function ListViewPagination({
	pageCount,
	isLoading,
	perPageOptions,
}: ListViewPaginationProps): JSX.Element {
	const {
		pagination,
		handleCountItemsPerPageChange,
		handleNavigateNext,
		handleNavigatePrevious,
	} = useQueryPagination(pageCount, perPageOptions);

	const { offset, limit } = pagination;
	const isNavigationDisabled = isLoading || limit < 0 || pageCount === 0;
	const isPreviousDisabled = offset <= 0 || isNavigationDisabled;
	const isNextDisabled = pageCount < limit || isNavigationDisabled;

	return (
		<nav
			aria-label="Pagination"
			data-testid="traces-list-pagination"
			className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-border tw:bg-card tw:px-4 tw:py-2.5 tw:font-sans tw:text-xs tw:text-subtle-foreground"
		>
			<span className="tw:tabular-nums">
				{pageCount > 0
					? `Showing ${offset + 1}–${offset + pageCount} spans`
					: 'No spans on this page'}
			</span>
			<div className="tw:flex tw:items-center tw:gap-1.5">
				<Button
					variant="ghost"
					size="sm"
					disabled={isPreviousDisabled}
					onClick={handleNavigatePrevious}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={isNextDisabled}
					onClick={handleNavigateNext}
				>
					Next
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							data-testid="traces-list-page-size"
							className="tw:font-normal tw:tabular-nums"
						>
							{`${limit} / page`}
							<ChevronDown />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuRadioGroup
							value={String(limit)}
							onValueChange={(value): void =>
								handleCountItemsPerPageChange(Number(value))
							}
						>
							{perPageOptions.map((size) => (
								<DropdownMenuRadioItem key={size} value={String(size)}>
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

export default ListViewPagination;
