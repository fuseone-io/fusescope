import { cn } from 'lib/utils';
import { BarChart3, DraftingCompass, ScrollText } from 'lucide-react';

const TABS = [
	{ value: 'logs', label: 'Logs', icon: ScrollText },
	{ value: 'traces', label: 'Traces', icon: DraftingCompass },
	{ value: 'metrics', label: 'Metrics', icon: BarChart3 },
];

interface SavedViewsTabsProps {
	value: string;
	onChange: (value: string) => void;
}

function SavedViewsTabs({ value, onChange }: SavedViewsTabsProps): JSX.Element {
	return (
		<fieldset
			aria-label="Signal"
			className="tw:inline-flex tw:gap-0.5 tw:rounded-md tw:border tw:border-border tw:bg-muted tw:p-0.5"
		>
			{TABS.map(({ value: tab, label, icon: Icon }) => (
				<button
					key={tab}
					type="button"
					value={tab}
					aria-pressed={value === tab}
					onClick={(): void => onChange(tab)}
					className={cn(
						'tw:inline-flex tw:h-7 tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-sm tw:border tw:border-transparent tw:px-2.5 tw:text-xs tw:font-medium tw:text-muted-foreground tw:hover:text-foreground',
						value === tab &&
							'tw:border-border tw:bg-surface-raised tw:text-foreground tw:shadow-xs',
					)}
				>
					<Icon aria-hidden="true" className="tw:size-3.5" />
					{label}
				</button>
			))}
		</fieldset>
	);
}

export default SavedViewsTabs;
