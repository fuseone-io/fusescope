import { ReactNode, useEffect, useRef } from 'react';
import { IOption } from 'hooks/useResourceAttribute/types';
import { cn } from 'lib/utils';
import { Check } from 'lucide-react';

interface OptionListProps {
	id: string;
	label: string;
	options: IOption[];
	activeIndex: number;
	onActiveChange: (index: number) => void;
	onPick: (option: IOption) => void;
	isSelected?: (value: string) => boolean;
	multiple?: boolean;
	empty: ReactNode;
}

export const optionId = (listId: string, index: number): string =>
	`${listId}-option-${index}`;

/**
 * A listbox driven from an input elsewhere (`aria-activedescendant`), so focus
 * never leaves that input: options take the click without the mousedown.
 */
function OptionList({
	id,
	label,
	options,
	activeIndex,
	onActiveChange,
	onPick,
	isSelected,
	multiple,
	empty,
}: OptionListProps): JSX.Element {
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		listRef.current
			?.querySelector(`[id="${optionId(id, activeIndex)}"]`)
			?.scrollIntoView?.({ block: 'nearest' });
	}, [id, activeIndex]);

	if (options.length === 0) {
		return (
			<div className="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-muted-foreground">
				{empty}
			</div>
		);
	}

	return (
		<div
			ref={listRef}
			id={id}
			role="listbox"
			aria-label={label}
			aria-multiselectable={multiple || undefined}
			className="tw:max-h-64 tw:overflow-y-auto tw:p-1"
		>
			{options.map((option, index) => {
				const selected = isSelected?.(option.value) ?? false;
				return (
					<div
						key={option.value}
						id={optionId(id, index)}
						role="option"
						tabIndex={-1}
						aria-selected={selected}
						data-active={index === activeIndex || undefined}
						onMouseDown={(event): void => event.preventDefault()}
						onMouseMove={(): void => onActiveChange(index)}
						onClick={(): void => onPick(option)}
						className="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-sm tw:px-2 tw:py-1.5 tw:text-sm tw:select-none tw:data-[active]:bg-accent tw:data-[active]:text-accent-foreground"
					>
						{multiple && (
							<span
								aria-hidden="true"
								className={cn(
									'tw:flex tw:size-4 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-sm tw:border tw:border-input',
									selected &&
										'tw:border-primary tw:bg-primary tw:text-primary-foreground',
								)}
							>
								{selected && <Check className="tw:size-3" />}
							</span>
						)}
						<span className="tw:truncate">{option.label}</span>
					</div>
				);
			})}
		</div>
	);
}

OptionList.defaultProps = {
	isSelected: undefined,
	multiple: false,
};

export default OptionList;
