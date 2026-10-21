import { ReactNode } from 'react';
import { Badge } from 'components/ui/badge';
import { cn } from 'lib/utils';
import { MonitorCog, Moon, Sun } from 'lucide-react';

interface ThemeOption {
	value: string;
	label: string;
	icon: ReactNode;
	beta?: boolean;
}

const THEME_OPTIONS: ThemeOption[] = [
	{
		value: 'dark',
		label: 'Dark',
		icon: <Moon data-testid="dark-theme-icon" />,
	},
	{
		value: 'light',
		label: 'Light',
		icon: <Sun data-testid="light-theme-icon" />,
		beta: true,
	},
	{
		value: 'auto',
		label: 'System',
		icon: <MonitorCog data-testid="auto-theme-icon" />,
	},
];

interface ThemeSelectorProps {
	value: string;
	onChange: (value: string) => void;
}

function ThemeSelector({ value, onChange }: ThemeSelectorProps): JSX.Element {
	return (
		<div
			role="group"
			aria-label="Theme"
			data-testid="theme-selector"
			className="tw:inline-flex tw:gap-0.5 tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:p-0.5"
		>
			{THEME_OPTIONS.map((option) => {
				const pressed = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						aria-pressed={pressed}
						onClick={(): void => {
							if (!pressed) {
								onChange(option.value);
							}
						}}
						className={cn(
							'tw:inline-flex tw:h-7 tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:text-[13px] tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground tw:transition-colors tw:outline-none tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:[&_svg]:size-3.5',
							pressed &&
								'tw:border-border tw:bg-surface-raised tw:text-foreground tw:shadow-xs',
						)}
					>
						{option.icon}
						{option.label}
						{option.beta && (
							<Badge
								variant="secondary"
								className="tw:bg-primary-soft tw:px-1.5 tw:py-0 tw:text-[11px] tw:leading-[18px] tw:text-primary-ink"
							>
								Beta
							</Badge>
						)}
					</button>
				);
			})}
		</div>
	);
}

export default ThemeSelector;
