import { MouseEvent, ReactNode } from 'react';
import { Button } from 'components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';
import { cn } from 'lib/utils';
import { ArrowRight, LoaderCircle } from 'lucide-react';

interface OnboardingNavButtonProps {
	children: ReactNode;
	onClick: () => void;
	variant?: 'primary' | 'secondary';
	disabled?: boolean;
	loading?: boolean;
	disabledTooltip?: string;
	showArrow?: boolean;
	testId?: string;
}

/**
 * Disabled through `aria-disabled` rather than `disabled`, so the button stays
 * hoverable and can explain why it is disabled.
 */
function OnboardingNavButton({
	children,
	onClick,
	variant = 'primary',
	disabled = false,
	loading = false,
	disabledTooltip,
	showArrow = false,
	testId,
}: OnboardingNavButtonProps): JSX.Element {
	const isDisabled = disabled || loading;

	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		if (isDisabled) {
			event.preventDefault();
			return;
		}
		onClick();
	};

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={variant === 'primary' ? 'default' : 'ghost'}
						aria-disabled={isDisabled || undefined}
						data-testid={testId}
						onClick={handleClick}
						className={cn(
							'tw:h-10 tw:w-full tw:font-sans',
							variant === 'secondary' && 'tw:text-muted-foreground',
							isDisabled && 'tw:cursor-not-allowed tw:opacity-50',
							isDisabled && variant === 'primary' && 'tw:hover:bg-primary',
						)}
					>
						{loading && <LoaderCircle className="tw:animate-spin" aria-hidden />}
						{children}
						{showArrow && <ArrowRight aria-hidden />}
					</Button>
				</TooltipTrigger>
				{disabled && !loading && disabledTooltip && (
					<TooltipContent side="top">{disabledTooltip}</TooltipContent>
				)}
			</Tooltip>
		</TooltipProvider>
	);
}

export default OnboardingNavButton;
