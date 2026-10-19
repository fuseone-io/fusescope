import { ChangeEvent } from 'react';
import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { Input } from 'components/ui/input';
import { ArrowDownWideNarrow, Check, Plus, Search } from 'lucide-react';
import { useAppContext } from 'providers/App/App';

import HintTooltip from '../HintTooltip/HintTooltip';

interface SearchBarProps {
	searchQuery: string;
	sortOrder: {
		columnKey: string;
		order: 'ascend' | 'descend';
	};
	onSearch: (e: ChangeEvent<HTMLInputElement>) => void;
	onSort: (key: string) => void;
	onCreateFunnel: () => void;
}

const SORT_OPTIONS = [
	{ key: 'created_at', label: 'Last created' },
	{ key: 'updated_at', label: 'Last updated' },
];

const SEARCH_PLACEHOLDER = 'Search by name, description, or tags...';

function SearchBar({
	searchQuery,
	sortOrder,
	onSearch,
	onSort,
	onCreateFunnel,
}: SearchBarProps): JSX.Element {
	const { hasEditPermission } = useAppContext();

	return (
		<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:font-sans">
			<DropdownMenu modal={false}>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-testid="sort-by"
						className="tw:border-input tw:bg-surface-raised tw:text-[13px] tw:dark:bg-surface-raised"
					>
						<ArrowDownWideNarrow className="tw:size-3.5" />
						Sort
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="tw:min-w-[180px]">
					<DropdownMenuLabel className="tw:px-2.5 tw:pt-1.5 tw:pb-1 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						Sort By
					</DropdownMenuLabel>
					{SORT_OPTIONS.map((option) => {
						const selected = sortOrder.columnKey === option.key;
						return (
							<DropdownMenuItem
								key={option.key}
								role="menuitemradio"
								aria-checked={selected}
								className="tw:text-[13px]"
								onSelect={(): void => onSort(option.key)}
							>
								<span className="tw:flex-1">{option.label}</span>
								{selected && <Check className="tw:size-3.5 tw:text-primary" />}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="tw:relative tw:min-w-0 tw:flex-[1_1_320px]">
				<Search
					aria-hidden="true"
					className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-2.5 tw:size-3.5 tw:-translate-y-1/2 tw:text-subtle-foreground"
				/>
				<Input
					type="search"
					aria-label="Search funnels"
					placeholder={SEARCH_PLACEHOLDER}
					value={searchQuery}
					onChange={onSearch}
					className="tw:h-8 tw:border-input tw:bg-surface-raised tw:pl-8 tw:text-[13px] tw:dark:bg-surface-raised"
				/>
			</div>
			<HintTooltip
				title={
					!hasEditPermission
						? 'You need editor or admin access to create funnels'
						: ''
				}
			>
				<Button
					type="button"
					size="sm"
					onClick={onCreateFunnel}
					disabled={!hasEditPermission}
				>
					<Plus />
					New funnel
				</Button>
			</HintTooltip>
		</div>
	);
}

export default SearchBar;
