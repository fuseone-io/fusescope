import React from 'react';
import { cn } from 'lib/utils';
import { Popover as PopoverPrimitive } from 'radix-ui';

function Popover({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>): JSX.Element {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>): JSX.Element {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

const PopoverContent = React.forwardRef<
	HTMLDivElement,
	React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent(
	{ className, align = 'center', sideOffset = 4, ...props },
	ref,
): JSX.Element {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				ref={ref}
				data-slot="popover-content"
				align={align}
				sideOffset={sideOffset}
				className={cn(
					'fs-ui',
					'tw:z-50 tw:w-72 tw:origin-(--radix-popover-content-transform-origin) tw:rounded-md tw:border tw:bg-popover tw:p-4 tw:text-popover-foreground tw:shadow-md tw:outline-hidden tw:data-[side=bottom]:slide-in-from-top-2 tw:data-[side=left]:slide-in-from-right-2 tw:data-[side=right]:slide-in-from-left-2 tw:data-[side=top]:slide-in-from-bottom-2 tw:data-[state=closed]:animate-out tw:data-[state=closed]:fade-out-0 tw:data-[state=closed]:zoom-out-95 tw:data-[state=open]:animate-in tw:data-[state=open]:fade-in-0 tw:data-[state=open]:zoom-in-95',
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
});

const PopoverAnchor = React.forwardRef<
	HTMLDivElement,
	React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>
>(function PopoverAnchor(props, ref): JSX.Element {
	return (
		<PopoverPrimitive.Anchor ref={ref} data-slot="popover-anchor" {...props} />
	);
});

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
