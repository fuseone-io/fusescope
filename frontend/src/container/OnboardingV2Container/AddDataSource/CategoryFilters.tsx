import { cn } from 'lib/utils';

interface CategoryFiltersProps {
	categories: { name: string; count: number }[];
	selectedCategory: string;
	onSelect: (category: string) => void;
}

function CategoryFilters({
	categories,
	selectedCategory,
	onSelect,
}: CategoryFiltersProps): JSX.Element {
	return (
		<nav
			aria-label="Filters"
			className="fs-ui tw:flex tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:p-3 tw:font-sans"
		>
			<div className="tw:flex tw:items-center tw:gap-3 tw:px-2 tw:pt-1">
				<h2 className="tw:text-xs tw:font-medium tw:tracking-wide tw:text-muted-foreground tw:uppercase">
					Filters
				</h2>
				<span aria-hidden className="tw:h-px tw:flex-1 tw:bg-border" />
			</div>
			<ul className="tw:flex tw:flex-col tw:gap-0.5">
				{categories.map(({ name, count }) => {
					const isSelected = selectedCategory === name;

					return (
						<li key={name}>
							<button
								type="button"
								aria-pressed={isSelected}
								onClick={(): void => onSelect(name)}
								className={cn(
									'tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:justify-between tw:gap-3 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-left tw:text-xs tw:tracking-wide tw:uppercase tw:transition-colors tw:outline-none tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50',
									isSelected
										? 'tw:bg-primary-soft tw:font-medium tw:text-primary-ink'
										: 'tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground',
								)}
							>
								<span className="tw:min-w-0 tw:truncate">{name}</span>
								<span className="tw:shrink-0 tw:text-xs tw:tabular-nums tw:text-subtle-foreground">
									{count}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

export default CategoryFilters;
