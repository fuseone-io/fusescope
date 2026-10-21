import { useMemo, useState } from 'react';
import CheckboxFilterV2 from 'components/QuickFilters/FilterRenderers/Checkbox/v2/CheckboxFilterV2';
import Duration from 'components/QuickFilters/FilterRenderers/Duration/Duration';
import {
	FiltersType,
	IQuickFiltersConfig,
	QuickFilterCheckboxUseFieldApis,
	QuickFiltersSource,
} from 'components/QuickFilters/types';
import { cn } from 'lib/utils';
import { ChevronDown } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';

import { quickFilterLabel } from './quickFilterBarUtils';

interface QuickFilterSelectProps {
	filter: IQuickFiltersConfig;
	source: QuickFiltersSource;
	summary: string;
	useFieldApis: QuickFilterCheckboxUseFieldApis;
}

/**
 * One quick filter as a select-like button whose popover holds the renderer
 * the filter rail shows, so selection, counts and query sync behave as they
 * do there.
 */
function QuickFilterSelect({
	filter,
	source,
	summary,
	useFieldApis,
}: QuickFilterSelectProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const isActive = summary !== 'All';
	const openFilter = useMemo(() => ({ ...filter, defaultOpen: true }), [filter]);

	return (
		<PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
			<PopoverPrimitive.Trigger asChild>
				<button
					type="button"
					data-testid={`quick-filter-select-${filter.attributeKey.key}`}
					className={cn(
						'fs-ui tw:inline-flex tw:h-8 tw:max-w-[280px] tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:px-2.5 tw:font-sans tw:text-xs tw:text-foreground tw:outline-none tw:hover:bg-muted tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:data-[state=open]:border-ring',
						isActive && 'tw:border-primary/60',
					)}
				>
					<span className="tw:truncate tw:text-muted-foreground">
						{quickFilterLabel(filter.attributeKey.key, filter.title)}
					</span>
					<span
						className={cn(
							'tw:font-medium tw:whitespace-nowrap',
							isActive && 'tw:text-primary-ink',
						)}
					>
						{summary}
					</span>
					<ChevronDown
						aria-hidden="true"
						className="tw:size-3.5 tw:flex-none tw:text-muted-foreground"
					/>
				</button>
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content
					align="start"
					sideOffset={6}
					collisionPadding={16}
					data-testid={`quick-filter-popover-${filter.attributeKey.key}`}
					className="quick-filter-popover tw:z-50 tw:max-h-[min(480px,var(--radix-popover-content-available-height))] tw:w-80 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:py-1 tw:text-foreground tw:shadow-lg tw:outline-none"
				>
					{filter.type === FiltersType.DURATION ? (
						<Duration source={source} filter={openFilter} />
					) : (
						<CheckboxFilterV2
							source={source}
							filter={openFilter}
							useFieldApis={useFieldApis}
						/>
					)}
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}

export default QuickFilterSelect;
