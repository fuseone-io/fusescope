import { ReactNode } from 'react';
import { cn } from 'lib/utils';

export interface K8sCategoryItem {
	key: string;
	label: string;
	icon: ReactNode;
}

interface K8sCategoryListProps {
	categories: K8sCategoryItem[];
	selected: string;
	onSelect: (key: string) => void;
}

function K8sCategoryList({
	categories,
	selected,
	onSelect,
}: K8sCategoryListProps): JSX.Element {
	return (
		<ul className="fs-ui tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-px tw:p-0 tw:font-sans">
			{categories.map((category) => {
				const isSelected = selected === category.key;
				return (
					<li key={category.key}>
						<button
							type="button"
							aria-current={isSelected ? 'page' : undefined}
							data-testid={`category-${category.key}`}
							onClick={(): void => onSelect(category.key)}
							className={cn(
								'tw:flex tw:h-8 tw:w-full tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-md tw:px-2 tw:text-left tw:text-[13px] tw:transition-colors tw:focus-visible:outline-2 tw:focus-visible:outline-ring',
								isSelected
									? 'tw:bg-primary-soft tw:font-medium tw:text-primary-ink'
									: 'tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground',
							)}
						>
							<span aria-hidden="true" className="tw:flex tw:flex-none">
								{category.icon}
							</span>
							<span className="tw:truncate">{category.label}</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

export default K8sCategoryList;
