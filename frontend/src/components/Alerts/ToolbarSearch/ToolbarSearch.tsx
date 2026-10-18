import { ChangeEvent } from 'react';
import { Input } from 'components/ui/input';
import { cn } from 'lib/utils';
import { Search } from 'lucide-react';

interface ToolbarSearchProps {
	value: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	placeholder: string;
	testId?: string;
	className?: string;
}

/** The search field that leads a list toolbar. */
function ToolbarSearch({
	value,
	onChange,
	placeholder,
	testId,
	className,
}: ToolbarSearchProps): JSX.Element {
	return (
		<div
			className={cn(
				'fs-ui tw:relative tw:min-w-60 tw:flex-[1_1_360px] tw:font-sans',
				className,
			)}
		>
			<Search
				aria-hidden="true"
				className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
			/>
			<Input
				type="search"
				data-testid={testId}
				aria-label={placeholder}
				placeholder={placeholder}
				value={value}
				onChange={onChange}
				className="tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
			/>
		</div>
	);
}

export default ToolbarSearch;
