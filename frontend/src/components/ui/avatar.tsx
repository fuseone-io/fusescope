import React from 'react';
import { cn } from 'lib/utils';
import { Avatar as AvatarPrimitive } from 'radix-ui';

const Avatar = React.forwardRef<
	React.ElementRef<typeof AvatarPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
		size?: 'default' | 'sm' | 'lg';
	}
>(function Avatar({ className, size = 'default', ...props }, ref): JSX.Element {
	return (
		<AvatarPrimitive.Root
			ref={ref}
			data-slot="avatar"
			data-size={size}
			className={cn(
				'tw:group/avatar tw:relative tw:flex tw:size-8 tw:shrink-0 tw:overflow-hidden tw:rounded-full tw:select-none tw:data-[size=lg]:size-10 tw:data-[size=sm]:size-6',
				className,
			)}
			{...props}
		/>
	);
});

function AvatarImage({
	className,
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>): JSX.Element {
	return (
		<AvatarPrimitive.Image
			data-slot="avatar-image"
			className={cn('tw:aspect-square tw:size-full', className)}
			{...props}
		/>
	);
}

function AvatarFallback({
	className,
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>): JSX.Element {
	return (
		<AvatarPrimitive.Fallback
			data-slot="avatar-fallback"
			className={cn(
				'tw:flex tw:size-full tw:items-center tw:justify-center tw:rounded-full tw:bg-muted tw:text-sm tw:text-muted-foreground tw:group-data-[size=sm]/avatar:text-xs',
				className,
			)}
			{...props}
		/>
	);
}

function AvatarBadge({
	className,
	...props
}: React.ComponentProps<'span'>): JSX.Element {
	return (
		<span
			data-slot="avatar-badge"
			className={cn(
				'tw:absolute tw:right-0 tw:bottom-0 tw:z-10 tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:bg-primary tw:text-primary-foreground tw:ring-2 tw:ring-background tw:select-none',
				'tw:group-data-[size=sm]/avatar:size-2 tw:group-data-[size=sm]/avatar:[&>svg]:hidden',
				'tw:group-data-[size=default]/avatar:size-2.5 tw:group-data-[size=default]/avatar:[&>svg]:size-2',
				'tw:group-data-[size=lg]/avatar:size-3 tw:group-data-[size=lg]/avatar:[&>svg]:size-2',
				className,
			)}
			{...props}
		/>
	);
}

function AvatarGroup({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<div
			data-slot="avatar-group"
			className={cn(
				'tw:group/avatar-group tw:flex tw:-space-x-2 tw:*:data-[slot=avatar]:ring-2 tw:*:data-[slot=avatar]:ring-background',
				className,
			)}
			{...props}
		/>
	);
}

function AvatarGroupCount({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<div
			data-slot="avatar-group-count"
			className={cn(
				'tw:relative tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-muted tw:text-sm tw:text-muted-foreground tw:ring-2 tw:ring-background tw:group-has-data-[size=lg]/avatar-group:size-10 tw:group-has-data-[size=sm]/avatar-group:size-6 tw:[&>svg]:size-4 tw:group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 tw:group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
				className,
			)}
			{...props}
		/>
	);
}

export {
	Avatar,
	AvatarImage,
	AvatarFallback,
	AvatarBadge,
	AvatarGroup,
	AvatarGroupCount,
};
