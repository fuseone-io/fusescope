import { TimelineTab } from 'container/AlertHistory/types';
import { cn } from 'lib/utils';

const TABS = [
	{
		value: TimelineTab.OVERALL_STATUS,
		label: 'Overall Status',
		testId: 'timeline-tab-overall-status',
		disabled: false,
	},
	{
		value: TimelineTab.TOP_5_CONTRIBUTORS,
		label: 'Top 5 Contributors',
		testId: 'timeline-tab-top-contributors',
		disabled: true,
	},
];

/** `SegmentedControl`'s look, with a disabled "Coming Soon" segment it can't express. */
function TimelineTabs(): JSX.Element {
	return (
		<div
			role="group"
			aria-label="Timeline view"
			className="tw:inline-flex tw:flex-none tw:gap-0.5 tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:p-0.5"
		>
			{TABS.map((tab) => {
				const pressed = tab.value === TimelineTab.OVERALL_STATUS;
				return (
					<button
						key={tab.value}
						type="button"
						aria-pressed={pressed}
						disabled={tab.disabled}
						data-testid={tab.testId}
						className={cn(
							'tw:inline-flex tw:h-7 tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:text-[13px] tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground tw:disabled:cursor-not-allowed',
							pressed &&
								'tw:border-border tw:bg-surface-raised tw:text-foreground tw:shadow-xs',
						)}
					>
						<span className={cn(tab.disabled && 'tw:opacity-60')}>{tab.label}</span>
						{tab.disabled && (
							<span className="tw:inline-flex tw:h-4 tw:items-center tw:rounded-sm tw:bg-warning-soft tw:px-1.5 tw:text-[10px] tw:font-medium tw:text-warning-ink">
								Coming Soon
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

export default TimelineTabs;
