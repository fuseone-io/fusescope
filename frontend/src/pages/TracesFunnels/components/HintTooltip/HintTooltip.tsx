import { ReactElement, ReactNode } from 'react';
import { cn } from 'lib/utils';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';

import { FLOATING_LAYER_CLASS } from '../../constants';

interface HintTooltipProps {
	title: ReactNode;
	children: ReactElement;
	className?: string;
	side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Wraps the child in a span so the hint also shows on disabled buttons. */
function HintTooltip({
	title,
	children,
	className,
	side,
}: HintTooltipProps): JSX.Element {
	if (!title) {
		return children;
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<span className={cn('tw:inline-flex', className)}>{children}</span>
				</TooltipTrigger>
				<TooltipContent side={side} className={FLOATING_LAYER_CLASS}>
					{title}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export default HintTooltip;
