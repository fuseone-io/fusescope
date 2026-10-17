import React from 'react';
import { cn } from 'lib/utils';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { Slot } from 'radix-ui';

function Breadcrumb({ ...props }: React.ComponentProps<'nav'>): JSX.Element {
	return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({
	className,
	...props
}: React.ComponentProps<'ol'>): JSX.Element {
	return (
		<ol
			data-slot="breadcrumb-list"
			className={cn(
				'tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:text-sm tw:break-words tw:text-muted-foreground tw:sm:gap-2.5',
				className,
			)}
			{...props}
		/>
	);
}

function BreadcrumbItem({
	className,
	...props
}: React.ComponentProps<'li'>): JSX.Element {
	return (
		<li
			data-slot="breadcrumb-item"
			className={cn('tw:inline-flex tw:items-center tw:gap-1.5', className)}
			{...props}
		/>
	);
}

function BreadcrumbLink({
	asChild,
	className,
	...props
}: React.ComponentPropsWithoutRef<'a'> & {
	asChild?: boolean;
}): JSX.Element {
	const Comp = asChild ? Slot.Root : 'a';

	return (
		<Comp
			data-slot="breadcrumb-link"
			className={cn('tw:transition-colors tw:hover:text-foreground', className)}
			{...props}
		/>
	);
}

function BreadcrumbPage({
	className,
	...props
}: React.ComponentProps<'span'>): JSX.Element {
	return (
		<span
			data-slot="breadcrumb-page"
			role="link"
			aria-disabled="true"
			aria-current="page"
			className={cn('tw:font-normal tw:text-foreground', className)}
			{...props}
		/>
	);
}

function BreadcrumbSeparator({
	children,
	className,
	...props
}: React.ComponentProps<'li'>): JSX.Element {
	return (
		<li
			data-slot="breadcrumb-separator"
			role="presentation"
			aria-hidden="true"
			className={cn('tw:[&>svg]:size-3.5', className)}
			{...props}
		>
			{children ?? <ChevronRight />}
		</li>
	);
}

function BreadcrumbEllipsis({
	className,
	...props
}: React.ComponentProps<'span'>): JSX.Element {
	return (
		<span
			data-slot="breadcrumb-ellipsis"
			role="presentation"
			aria-hidden="true"
			className={cn(
				'tw:flex tw:size-9 tw:items-center tw:justify-center',
				className,
			)}
			{...props}
		>
			<MoreHorizontal className="tw:size-4" />
			<span className="tw:sr-only">More</span>
		</span>
	);
}

export {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
	BreadcrumbEllipsis,
};
