import { FocusEvent, useRef } from 'react';
import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { X } from 'lucide-react';

import { ChartPointAction, ChartPointAnchor } from './types';

interface ChartPointPopoverProps {
	anchor: ChartPointAnchor;
	/** The bucket time, with its timezone. */
	time: string;
	/** The clicked series' value, formatted with the chart unit. */
	value?: string;
	actions: ChartPointAction[];
	context: string;
	onClose: () => void;
	/** Keeps the popover inside this element as well as the viewport. */
	boundary?: Element | null;
	returnFocusTo?: HTMLElement | null;
}

/**
 * A time marker at a chart point with a menu beside it: the point's time and
 * value, what can be opened from it and the context those links carry.
 * Mounted while open; place it in a positioned element over the plot.
 */
function ChartPointPopover({
	anchor,
	time,
	value,
	actions,
	context,
	onClose,
	boundary,
	returnFocusTo,
}: ChartPointPopoverProps): JSX.Element {
	const hasFocusedItem = useRef(false);

	// The menu focuses itself on open; move on to the first item once.
	const focusFirstItem = (event: FocusEvent<HTMLDivElement>): void => {
		if (hasFocusedItem.current || event.target !== event.currentTarget) {
			return;
		}
		hasFocusedItem.current = true;
		event.currentTarget
			.querySelector<HTMLElement>('[role="menuitem"]')
			?.focus({ preventScroll: true });
	};

	return (
		<DropdownMenu
			open
			modal={false}
			onOpenChange={(open): void => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DropdownMenuTrigger asChild>
				<span
					data-testid="chart-point-marker"
					aria-hidden
					tabIndex={-1}
					className="tw:pointer-events-none tw:absolute tw:z-[1] tw:w-px tw:bg-ink-subtle"
					style={{ left: anchor.left, top: anchor.top, height: anchor.height }}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="right"
				align="start"
				sideOffset={8}
				collisionPadding={8}
				collisionBoundary={boundary}
				aria-label={`Drilldown at ${time}`}
				aria-labelledby={undefined}
				onFocus={focusFirstItem}
				onCloseAutoFocus={(event): void => {
					if (returnFocusTo) {
						event.preventDefault();
						returnFocusTo.focus({ preventScroll: true });
					}
				}}
				className="tw:flex tw:w-[228px] tw:flex-col tw:gap-0.5 tw:rounded-[10px] tw:p-1.5 tw:text-foreground tw:shadow-lg"
			>
				<div className="tw:mb-0.5 tw:flex tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-border tw:pt-1 tw:pr-1 tw:pb-1.5 tw:pl-2">
					<span className="tw:flex tw:min-w-0 tw:flex-col tw:text-xs tw:leading-[1.3] tw:tabular-nums">
						<span className="tw:font-semibold">{time}</span>
						{value && (
							<span className="tw:truncate tw:text-muted-foreground">{value}</span>
						)}
					</span>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Close drilldown"
						className="tw:text-muted-foreground"
						onClick={onClose}
					>
						<X className="tw:size-3.5" />
					</Button>
				</div>
				{actions.map((action) => (
					<DropdownMenuItem
						key={action.key}
						onSelect={action.onSelect}
						className="tw:h-8 tw:gap-2 tw:rounded-md tw:px-2 tw:py-0 tw:text-[13px] tw:focus:bg-muted tw:focus:text-foreground tw:[&_svg:not([class*=text-])]:text-subtle-foreground"
					>
						{action.icon}
						{action.label}
					</DropdownMenuItem>
				))}
				<span className="tw:px-2 tw:pt-0.5 tw:pb-1 tw:text-[11px] tw:text-subtle-foreground">
					{context}
				</span>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default ChartPointPopover;
