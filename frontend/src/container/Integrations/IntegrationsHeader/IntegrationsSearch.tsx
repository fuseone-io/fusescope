import { Input } from 'components/ui/input';
import { Search } from 'lucide-react';

const SEARCH_PLACEHOLDER = 'Search for an integration...';

interface IntegrationsSearchProps {
	value: string;
	onChange: (value: string) => void;
}

function IntegrationsSearch({
	value,
	onChange,
}: IntegrationsSearchProps): JSX.Element {
	return (
		<div className="fs-ui tw:relative tw:w-full tw:font-sans">
			<Search
				aria-hidden="true"
				className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
			/>
			<Input
				type="search"
				data-testid="integrations-search"
				aria-label={SEARCH_PLACEHOLDER}
				placeholder={SEARCH_PLACEHOLDER}
				value={value}
				onChange={(event): void => onChange(event.target.value)}
				className="tw:h-9 tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
			/>
		</div>
	);
}

export default IntegrationsSearch;
