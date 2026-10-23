import { useState } from 'react';
import { Input } from 'components/ui/input';
import { Search } from 'lucide-react';

interface ErrorSearchProps {
	value: string;
	onChange: (search: string) => void;
}

/** Applies on Enter or blur; remount it with `key` when the URL changes. */
function ErrorSearch({ value, onChange }: ErrorSearchProps): JSX.Element {
	const [draft, setDraft] = useState(value);
	const apply = (): void => {
		if (draft.trim() !== value) {
			onChange(draft.trim());
		}
	};
	return (
		<form
			className="tw:relative tw:flex tw:min-w-60 tw:flex-1 tw:items-center"
			onSubmit={(event): void => {
				event.preventDefault();
				apply();
			}}
		>
			<Search
				aria-hidden="true"
				className="tw:pointer-events-none tw:absolute tw:left-2.5 tw:size-4 tw:text-subtle-foreground"
			/>
			<Input
				data-testid="rum-errors-search"
				aria-label="Search errors"
				placeholder="Type, message or frame, e.g. TypeError or PriceTag"
				value={draft}
				onChange={(event): void => setDraft(event.target.value)}
				onBlur={apply}
				className="tw:pl-8 tw:text-xs"
			/>
		</form>
	);
}

export default ErrorSearch;
