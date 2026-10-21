import React, { MouseEvent, ReactNode } from 'react';
import { Button } from 'components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';
import { cn } from 'lib/utils';
import { Loader2 } from 'lucide-react';

type ActionButtonProps = Omit<
	React.ComponentPropsWithoutRef<typeof Button>,
	'disabled'
> & {
	disabled?: boolean;
	/** Shown in a tooltip while the button is disabled. */
	disabledReason?: string;
	loading?: boolean;
	icon?: ReactNode;
	testId?: string;
};

/**
 * A `components/ui` button that stays focusable while disabled
 * (`aria-disabled`), so a tooltip can say why, and shows a spinner while busy.
 */
function ActionButton({
	disabled = false,
	disabledReason,
	loading = false,
	icon,
	testId,
	onClick,
	className,
	children,
	...props
}: ActionButtonProps): JSX.Element {
	const inactive = disabled || loading;

	const button = (
		<Button
			type="button"
			data-testid={testId}
			{...props}
			aria-disabled={inactive || undefined}
			aria-busy={loading || undefined}
			className={cn(
				inactive && 'tw:cursor-not-allowed tw:opacity-50 tw:hover:bg-inherit',
				className,
			)}
			onClick={(event: MouseEvent<HTMLButtonElement>): void => {
				if (inactive) {
					event.preventDefault();
					return;
				}
				onClick?.(event);
			}}
		>
			{loading ? <Loader2 className="tw:animate-spin" aria-hidden="true" /> : icon}
			{children}
		</Button>
	);

	// Always wrapped, so toggling `disabled` keeps the same button element.
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				{disabled && disabledReason && (
					<TooltipContent>{disabledReason}</TooltipContent>
				)}
			</Tooltip>
		</TooltipProvider>
	);
}

export default ActionButton;
