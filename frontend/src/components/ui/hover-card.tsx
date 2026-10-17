import React from 'react';
import { cn } from 'lib/utils';
import { HoverCard as HoverCardPrimitive } from 'radix-ui';

function HoverCard({
	...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>): JSX.Element {
	return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({
	...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>): JSX.Element {
	return (
		<HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
	);
}

const HoverCardContent = React.forwardRef<
	React.ElementRef<typeof HoverCardPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(function HoverCardContent(
	{ className, align = 'center', sideOffset = 4, ...props },
	ref,
): JSX.Element {
	return (
		<HoverCardPrimitive.Portal data-slot="hover-card-portal">
			<HoverCardPrimitive.Content
				ref={ref}
				data-slot="hover-card-content"
				align={align}
				sideOffset={sideOffset}
				className={cn(
					'fs-ui',
					'tw:z-50 tw:w-64 tw:origin-(--radix-hover-card-content-transform-origin) tw:rounded-md tw:border tw:border-border tw:bg-popover tw:p-4 tw:font-sans tw:text-sm tw:text-popover-foreground tw:shadow-md tw:outline-hidden tw:data-[side=bottom]:slide-in-from-top-2 tw:data-[side=left]:slide-in-from-right-2 tw:data-[side=right]:slide-in-from-left-2 tw:data-[side=top]:slide-in-from-bottom-2 tw:data-[state=closed]:animate-out tw:data-[state=closed]:fade-out-0 tw:data-[state=closed]:zoom-out-95 tw:data-[state=open]:animate-in tw:data-[state=open]:fade-in-0 tw:data-[state=open]:zoom-in-95',
					className,
				)}
				{...props}
			/>
		</HoverCardPrimitive.Portal>
	);
});

export { HoverCard, HoverCardTrigger, HoverCardContent };
