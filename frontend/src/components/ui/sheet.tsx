import React from 'react';
import { cn } from 'lib/utils';
import { XIcon } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';

function Sheet({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Root>): JSX.Element {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>): JSX.Element {
	return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Close>): JSX.Element {
	return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>): JSX.Element {
	return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

const SheetOverlay = React.forwardRef<
	React.ElementRef<typeof SheetPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref): JSX.Element {
	return (
		<SheetPrimitive.Overlay
			ref={ref}
			data-slot="sheet-overlay"
			className={cn(
				'fs-ui',
				'tw:fixed tw:inset-0 tw:z-50 tw:bg-black/50 tw:data-[state=closed]:animate-out tw:data-[state=closed]:fade-out-0 tw:data-[state=open]:animate-in tw:data-[state=open]:fade-in-0',
				className,
			)}
			{...props}
		/>
	);
});

function SheetContent({
	className,
	children,
	side = 'right',
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
	side?: 'top' | 'right' | 'bottom' | 'left';
	showCloseButton?: boolean;
}): JSX.Element {
	return (
		<SheetPortal>
			<SheetOverlay />
			<SheetPrimitive.Content
				data-slot="sheet-content"
				className={cn(
					'fs-ui',
					'tw:fixed tw:z-50 tw:flex tw:flex-col tw:gap-4 tw:bg-background tw:shadow-lg tw:transition tw:ease-in-out tw:data-[state=closed]:animate-out tw:data-[state=closed]:duration-300 tw:data-[state=open]:animate-in tw:data-[state=open]:duration-500',
					side === 'right' &&
						'tw:inset-y-0 tw:right-0 tw:h-full tw:w-3/4 tw:border-l tw:data-[state=closed]:slide-out-to-right tw:data-[state=open]:slide-in-from-right tw:sm:max-w-sm',
					side === 'left' &&
						'tw:inset-y-0 tw:left-0 tw:h-full tw:w-3/4 tw:border-r tw:data-[state=closed]:slide-out-to-left tw:data-[state=open]:slide-in-from-left tw:sm:max-w-sm',
					side === 'top' &&
						'tw:inset-x-0 tw:top-0 tw:h-auto tw:border-b tw:data-[state=closed]:slide-out-to-top tw:data-[state=open]:slide-in-from-top',
					side === 'bottom' &&
						'tw:inset-x-0 tw:bottom-0 tw:h-auto tw:border-t tw:data-[state=closed]:slide-out-to-bottom tw:data-[state=open]:slide-in-from-bottom',
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<SheetPrimitive.Close className="tw:absolute tw:top-4 tw:right-4 tw:rounded-xs tw:opacity-70 tw:ring-offset-background tw:transition-opacity tw:hover:opacity-100 tw:focus:ring-2 tw:focus:ring-ring tw:focus:ring-offset-2 tw:focus:outline-hidden tw:disabled:pointer-events-none tw:data-[state=open]:bg-secondary">
						<XIcon className="tw:size-4" />
						<span className="tw:sr-only">Close</span>
					</SheetPrimitive.Close>
				)}
			</SheetPrimitive.Content>
		</SheetPortal>
	);
}

function SheetHeader({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<div
			data-slot="sheet-header"
			className={cn('tw:flex tw:flex-col tw:gap-1.5 tw:p-4', className)}
			{...props}
		/>
	);
}

function SheetFooter({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<div
			data-slot="sheet-footer"
			className={cn('tw:mt-auto tw:flex tw:flex-col tw:gap-2 tw:p-4', className)}
			{...props}
		/>
	);
}

function SheetTitle({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Title>): JSX.Element {
	return (
		<SheetPrimitive.Title
			data-slot="sheet-title"
			className={cn('tw:font-semibold tw:text-foreground', className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Description>): JSX.Element {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn('tw:text-sm tw:text-muted-foreground', className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetTrigger,
	SheetClose,
	SheetPortal,
	SheetOverlay,
	SheetContent,
	SheetHeader,
	SheetFooter,
	SheetTitle,
	SheetDescription,
};
