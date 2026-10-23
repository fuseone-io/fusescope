import { useState } from 'react';
import { Input } from 'components/ui/input';
import { Search } from 'lucide-react';

interface UserIdFilterProps {
	value: string;
	onChange: (userId: string) => void;
}

/** Applies on Enter or blur; remount it with `key` when the URL changes. */
function UserIdFilter({ value, onChange }: UserIdFilterProps): JSX.Element {
	const [draft, setDraft] = useState(value);
	const apply = (): void => {
		if (draft.trim() !== value) {
			onChange(draft.trim());
		}
	};
	return (
		<form
			className="tw:relative tw:flex tw:items-center"
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
				data-testid="rum-sessions-user"
				aria-label="User id"
				placeholder="user.id or user.hash"
				value={draft}
				onChange={(event): void => setDraft(event.target.value)}
				onBlur={apply}
				className="tw:w-52 tw:pl-8 tw:font-mono tw:text-xs"
			/>
		</form>
	);
}

export default UserIdFilter;
