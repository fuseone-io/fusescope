import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Input } from 'components/ui/input';
import { Search } from 'lucide-react';

import { CATALOG_FILTERS } from '../../constants';
import type { CatalogFilter } from '../../types';

const SEARCH_PLACEHOLDER = 'Search: Java, Kubernetes, nginx, syslog, OpenAI…';

interface CatalogToolbarProps {
	query: string;
	onQueryChange: (query: string) => void;
	filter: CatalogFilter;
	onFilterChange: (filter: CatalogFilter) => void;
}

function CatalogToolbar({
	query,
	onQueryChange,
	filter,
	onFilterChange,
}: CatalogToolbarProps): JSX.Element {
	return (
		<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
			<div className="tw:relative tw:min-w-0 tw:flex-[1_1_280px] tw:md:max-w-[420px]">
				<Search
					aria-hidden="true"
					className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
				/>
				<Input
					type="search"
					value={query}
					onChange={(event): void => onQueryChange(event.target.value)}
					placeholder={SEARCH_PLACEHOLDER}
					aria-label="Search data sources"
					data-testid="catalog-search"
					className="tw:h-9 tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
				/>
			</div>
			<SegmentedControl
				label="Goal"
				options={CATALOG_FILTERS.map((option) => ({
					...option,
					testId: `catalog-filter-${option.value}`,
				}))}
				value={filter}
				onChange={onFilterChange}
				className="tw:flex-wrap"
			/>
		</div>
	);
}

export default CatalogToolbar;
