import { ChangeEvent } from 'react';
import { Input } from 'components/ui/input';
import { cn } from 'lib/utils';
import { Search } from 'lucide-react';

interface SettingsSearchInputProps {
	value: string;
	placeholder: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	name?: string;
	disabled?: boolean;
	testId?: string;
	className?: string;
}

function SettingsSearchInput({
	value,
	placeholder,
	onChange,
	name,
	disabled,
	testId,
	className,
}: SettingsSearchInputProps): JSX.Element {
	return (
		<div
			className={cn(
				'fs-ui tw:relative tw:min-w-0 tw:flex-[1_1_280px] tw:font-sans',
				className,
			)}
		>
			<Search
				aria-hidden="true"
				className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
			/>
			<Input
				type="search"
				name={name}
				aria-label={placeholder}
				placeholder={placeholder}
				value={value}
				onChange={onChange}
				disabled={disabled}
				data-testid={testId}
				className="tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
			/>
		</div>
	);
}

export default SettingsSearchInput;
