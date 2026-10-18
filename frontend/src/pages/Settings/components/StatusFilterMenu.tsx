import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { Check } from 'lucide-react';

import FilterTrigger from './FilterTrigger';
import { StatusFilterOption } from './types';
import { optionText } from './utils';

interface StatusFilterMenuProps<Value extends string> {
	options: StatusFilterOption<Value>[];
	value: Value;
	onChange: (value: Value) => void;
	disabled?: boolean;
}

/** Status filter of a settings list; the trigger names the active option. */
function StatusFilterMenu<Value extends string>({
	options,
	value,
	onChange,
	disabled,
}: StatusFilterMenuProps<Value>): JSX.Element {
	const active = options.find((option) => option.value === value) ?? options[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<FilterTrigger label={optionText(active)} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="tw:min-w-[200px]">
				{options.map((option) => (
					<DropdownMenuItem
						key={option.value}
						onSelect={(): void => onChange(option.value)}
						className="tw:justify-between tw:gap-4 tw:text-[13px]"
					>
						<span>{optionText(option)}</span>
						{option.value === value && <Check aria-hidden="true" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default StatusFilterMenu;
