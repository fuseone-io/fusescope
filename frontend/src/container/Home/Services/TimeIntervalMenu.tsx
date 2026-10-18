import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { ChevronDown, Clock } from 'lucide-react';

import { TIME_PICKER_OPTIONS } from './constants';

interface TimeIntervalMenuProps {
	value: number;
	onChange: (value: number) => void;
}

function TimeIntervalMenu({
	value,
	onChange,
}: TimeIntervalMenuProps): JSX.Element {
	const selected = TIME_PICKER_OPTIONS.find((option) => option.value === value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					data-testid="home-services-interval"
					className="tw:bg-surface-raised! tw:text-[13px] tw:font-normal tw:text-foreground! tw:hover:bg-muted!"
				>
					<Clock aria-hidden="true" className="tw:text-subtle-foreground" />
					{selected?.label}
					<ChevronDown aria-hidden="true" className="tw:text-subtle-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="tw:font-sans">
				<DropdownMenuRadioGroup
					value={String(value)}
					onValueChange={(next): void => onChange(Number(next))}
				>
					{TIME_PICKER_OPTIONS.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={String(option.value)}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default TimeIntervalMenu;
