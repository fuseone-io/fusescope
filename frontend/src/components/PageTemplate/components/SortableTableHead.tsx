import { ReactNode } from 'react';
import { TableHead } from 'components/ui/table';
import { cn } from 'lib/utils';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { SortDirection } from '../types';

interface SortableTableHeadProps {
	label: ReactNode;
	active: boolean;
	direction: SortDirection;
	onSort: () => void;
	align?: 'left' | 'right';
	testId?: string;
	className?: string;
}

function SortableTableHead({
	label,
	active,
	direction,
	onSort,
	align = 'left',
	testId,
	className,
}: SortableTableHeadProps): JSX.Element {
	let ariaSort: 'ascending' | 'descending' | 'none' = 'none';
	if (active) {
		ariaSort = direction === 'asc' ? 'ascending' : 'descending';
	}

	let Icon = ChevronsUpDown;
	if (active) {
		Icon = direction === 'asc' ? ArrowUp : ArrowDown;
	}

	return (
		<TableHead
			aria-sort={ariaSort}
			className={cn(align === 'right' && 'tw:text-right', className)}
		>
			<button
				type="button"
				data-testid={testId}
				onClick={onSort}
				className={cn(
					'tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1 tw:align-middle tw:border-0 tw:bg-transparent tw:p-0 tw:tracking-[inherit] tw:text-muted-foreground! tw:uppercase tw:hover:text-foreground! tw:focus-visible:outline-2 tw:focus-visible:outline-ring',
					align === 'right' && 'tw:flex-row-reverse',
					active && 'tw:text-foreground!',
				)}
			>
				{label}
				<Icon aria-hidden="true" className="tw:size-3.5 tw:flex-none" />
			</button>
		</TableHead>
	);
}

export default SortableTableHead;
