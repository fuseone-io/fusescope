import React from 'react';
import { cn } from 'lib/utils';
import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

// z-[1000] matches antd's modal layer, so a dialog opened from inside an antd
// modal stacks above it and antd popups (z 1030+) still open above the dialog.
const LAYER = 'tw:z-[1000]';

function Dialog({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Root>): JSX.Element {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>): JSX.Element {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>): JSX.Element {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Close>): JSX.Element {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref): JSX.Element {
	return (
		<DialogPrimitive.Overlay
			ref={ref}
			data-slot="dialog-overlay"
			className={cn(
				'fs-ui',
				LAYER,
				'tw:fixed tw:inset-0 tw:bg-black/50 tw:data-[state=closed]:animate-out tw:data-[state=closed]:fade-out-0 tw:data-[state=open]:animate-in tw:data-[state=open]:fade-in-0',
				className,
			)}
			{...props}
		/>
	);
});

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
		showCloseButton?: boolean;
	}
>(function DialogContent(
	{ className, children, showCloseButton = true, ...props },
	ref,
): JSX.Element {
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Content
				ref={ref}
				data-slot="dialog-content"
				className={cn(
					'fs-ui',
					LAYER,
					'tw:fixed tw:top-1/2 tw:left-1/2 tw:flex tw:w-[calc(100%-2rem)] tw:max-w-sm tw:-translate-x-1/2 tw:-translate-y-1/2 tw:flex-col tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground tw:shadow-lg tw:outline-none tw:data-[state=closed]:animate-out tw:data-[state=closed]:fade-out-0 tw:data-[state=closed]:zoom-out-95 tw:data-[state=open]:animate-in tw:data-[state=open]:fade-in-0 tw:data-[state=open]:zoom-in-95',
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close
						data-slot="dialog-close"
						className="tw:absolute tw:top-3.5 tw:right-3.5 tw:cursor-pointer tw:rounded-xs tw:border-0 tw:bg-transparent tw:p-0 tw:text-muted-foreground tw:opacity-70 tw:transition-opacity tw:hover:opacity-100 tw:focus-visible:outline-2 tw:focus-visible:outline-ring tw:[&_svg]:size-4"
					>
						<XIcon />
						<span className="tw:sr-only">Close</span>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	);
});

function DialogHeader({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<div
			data-slot="dialog-header"
			className={cn('tw:flex tw:flex-col tw:gap-1 tw:px-5 tw:pt-4', className)}
			{...props}
		/>
	);
}

function DialogBody({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<div
			data-slot="dialog-body"
			className={cn(
				'tw:flex tw:flex-col tw:gap-2 tw:px-5 tw:pt-3 tw:pb-4 tw:text-[13px] tw:text-muted-foreground',
				className,
			)}
			{...props}
		/>
	);
}

function DialogFooter({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<div
			data-slot="dialog-footer"
			className={cn(
				'tw:flex tw:flex-wrap tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3',
				className,
			)}
			{...props}
		/>
	);
}

function DialogTitle({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Title>): JSX.Element {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn(
				'tw:m-0 tw:text-sm tw:font-semibold tw:text-foreground',
				className,
			)}
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>): JSX.Element {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn('tw:m-0 tw:text-[13px] tw:text-muted-foreground', className)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
