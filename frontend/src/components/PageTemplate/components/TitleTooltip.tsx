import { ReactElement, ReactNode } from 'react';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';
import { cn } from 'lib/utils';

interface TitleTooltipProps {
	/** Nothing to show renders the child alone. */
	title?: ReactNode;
	/** Must accept a ref; wrap disabled controls in a span so they still hover. */
	children: ReactElement;
	side?: 'top' | 'right' | 'bottom' | 'left';
	className?: string;
}

/** A hover hint from a `title`, on the new-UI tooltip. */
function TitleTooltip({
	title,
	children,
	side,
	className,
}: TitleTooltipProps): JSX.Element {
	if (title === undefined || title === null || title === '') {
		return children;
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{children}</TooltipTrigger>
				<TooltipContent
					side={side}
					sideOffset={4}
					className={cn('tw:z-[1100] tw:max-w-sm tw:font-sans', className)}
				>
					{title}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export default TitleTooltip;
