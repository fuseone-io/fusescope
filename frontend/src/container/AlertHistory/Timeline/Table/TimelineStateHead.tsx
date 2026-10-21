import { TableHead } from 'components/ui/table';
import { TimelineSortOrder } from 'container/AlertHistory/utils/display';
import { cn } from 'lib/utils';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

interface TimelineStateHeadProps {
	order: TimelineSortOrder | null;
	onSort: () => void;
}

const ARIA_SORT = {
	ascend: 'ascending',
	descend: 'descending',
} as const;

/** The sortable STATE header; the whole cell is the button. */
function TimelineStateHead({
	order,
	onSort,
}: TimelineStateHeadProps): JSX.Element {
	let Icon = ChevronsUpDown;
	if (order) {
		Icon = order === 'ascend' ? ArrowUp : ArrowDown;
	}

	return (
		<TableHead
			aria-sort={order ? ARIA_SORT[order] : 'none'}
			className="tw:w-40 tw:p-0"
		>
			<button
				type="button"
				onClick={onSort}
				data-testid="timeline-sort-state"
				className={cn(
					'tw:flex tw:h-9 tw:w-full tw:cursor-pointer tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:px-5 tw:text-xs tw:font-medium tw:tracking-[inherit] tw:text-muted-foreground tw:uppercase tw:hover:text-foreground tw:focus-visible:outline-2 tw:focus-visible:outline-ring',
					order && 'tw:text-foreground',
				)}
			>
				State
				<Icon aria-hidden="true" className="tw:size-3.5 tw:flex-none" />
			</button>
		</TableHead>
	);
}

export default TimelineStateHead;
