import { useId, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from 'components/ui/popover';
import { IOption } from 'hooks/useResourceAttribute/types';
import { cn } from 'lib/utils';
import { ChevronDown, Search } from 'lucide-react';

import {
	ENVIRONMENT_PLACEHOLDER,
	FIELD_CLASS,
	FIELD_FOCUS_CLASS,
} from '../../constants';
import { useOptionList } from '../../hooks/useOptionList';
import OptionList, { optionId } from '../OptionList/OptionList';

interface EnvironmentSelectProps {
	options: IOption[];
	value: string[];
	onChange: (environments: string[]) => void;
}

/** Multi-select that stays open, reporting every tick as it happens. */
function EnvironmentSelect({
	options,
	value,
	onChange,
}: EnvironmentSelectProps): JSX.Element {
	const listId = useId();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');

	const toggle = (option: IOption): void => {
		onChange(
			value.includes(option.value)
				? value.filter((environment) => environment !== option.value)
				: [...value, option.value],
		);
	};

	const list = useOptionList(options, search, toggle);

	const onOpenChange = (next: boolean): void => {
		setOpen(next);
		if (!next) {
			setSearch('');
		}
	};

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-testid="resource-environment-filter"
					aria-haspopup="listbox"
					className={cn(
						FIELD_CLASS,
						FIELD_FOCUS_CLASS,
						'tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-2 tw:px-3 tw:text-left tw:sm:w-56',
					)}
				>
					<span
						className={cn(
							'tw:min-w-0 tw:flex-1 tw:truncate',
							value.length ? 'tw:text-foreground' : 'tw:text-muted-foreground',
						)}
					>
						{value.length ? value.join(', ') : ENVIRONMENT_PLACEHOLDER}
					</span>
					<ChevronDown
						aria-hidden="true"
						className="tw:size-4 tw:shrink-0 tw:text-muted-foreground"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="tw:w-(--radix-popover-trigger-width) tw:min-w-56 tw:p-0"
			>
				<div className="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-border tw:px-3">
					<Search
						aria-hidden="true"
						className="tw:size-4 tw:shrink-0 tw:text-muted-foreground"
					/>
					<input
						// A text input is a textbox; oxlint wrongly treats combobox as implicit.
						// oxlint-disable-next-line jsx-a11y/no-redundant-roles
						role="combobox"
						aria-label="Search environments"
						aria-expanded
						aria-controls={listId}
						aria-activedescendant={
							list.visible.length ? optionId(listId, list.activeIndex) : undefined
						}
						placeholder="Search environments"
						value={search}
						onChange={(event): void => setSearch(event.target.value)}
						onKeyDown={list.onKeyDown}
						className="tw:h-9 tw:min-w-0 tw:flex-1 tw:bg-transparent tw:text-sm tw:outline-none tw:placeholder:text-muted-foreground"
					/>
				</div>
				<OptionList
					id={listId}
					label="Environments"
					options={list.visible}
					activeIndex={list.activeIndex}
					onActiveChange={list.setActiveIndex}
					onPick={toggle}
					isSelected={(environment): boolean => value.includes(environment)}
					multiple
					empty="No environments found"
				/>
			</PopoverContent>
		</Popover>
	);
}

export default EnvironmentSelect;
