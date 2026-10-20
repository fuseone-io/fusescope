import { Input } from 'components/ui/input';
import ResourceAttributesFilter from 'container/ResourceAttributesFilter';
import { Search } from 'lucide-react';

import { SEARCH_PLACEHOLDER } from './constants';

interface ServicesFilterRowProps {
	search: string;
	onSearch: (term: string) => void;
}

/** Service search, then the environment and resource attribute filter. */
function ServicesFilterRow({
	search,
	onSearch,
}: ServicesFilterRowProps): JSX.Element {
	return (
		<div className="tw:flex tw:flex-wrap tw:items-start tw:gap-2">
			<div className="fs-ui tw:relative tw:w-full tw:font-sans tw:sm:w-72">
				<Search
					aria-hidden="true"
					className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
				/>
				<Input
					type="search"
					data-testid="services-search"
					aria-label={SEARCH_PLACEHOLDER}
					placeholder={SEARCH_PLACEHOLDER}
					value={search}
					onChange={(event): void => onSearch(event.target.value)}
					className="tw:h-9 tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
				/>
			</div>
			<div className="tw:min-w-0 tw:flex-1">
				<ResourceAttributesFilter />
			</div>
		</div>
	);
}

export default ServicesFilterRow;
