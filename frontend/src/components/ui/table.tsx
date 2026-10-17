import React from 'react';
import { cn } from 'lib/utils';

function Table({
	className,
	...props
}: React.ComponentProps<'table'>): JSX.Element {
	return (
		<div
			data-slot="table-container"
			className="fs-ui tw:relative tw:w-full tw:overflow-x-auto tw:font-sans"
		>
			<table
				data-slot="table"
				className={cn(
					'tw:w-full tw:caption-bottom tw:border-collapse tw:text-[13px]',
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({
	className,
	...props
}: React.ComponentProps<'thead'>): JSX.Element {
	return (
		<thead
			data-slot="table-header"
			className={cn(
				'tw:[&_tr]:border-b tw:[&_tr]:hover:bg-transparent',
				className,
			)}
			{...props}
		/>
	);
}

function TableBody({
	className,
	...props
}: React.ComponentProps<'tbody'>): JSX.Element {
	return (
		<tbody
			data-slot="table-body"
			className={cn('tw:[&_tr:last-child]:border-0', className)}
			{...props}
		/>
	);
}

function TableFooter({
	className,
	...props
}: React.ComponentProps<'tfoot'>): JSX.Element {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn(
				'tw:border-t tw:bg-muted/50 tw:font-medium tw:[&>tr]:last:border-b-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({
	className,
	...props
}: React.ComponentProps<'tr'>): JSX.Element {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				'tw:border-b tw:border-border tw:transition-colors tw:hover:bg-muted tw:has-aria-expanded:bg-muted tw:data-[state=selected]:bg-muted',
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({
	className,
	...props
}: React.ComponentProps<'th'>): JSX.Element {
	return (
		<th
			data-slot="table-head"
			className={cn(
				'tw:h-9 tw:px-5 tw:text-left tw:align-middle tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:whitespace-nowrap tw:text-muted-foreground tw:uppercase tw:[&:has([role=checkbox])]:pr-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({
	className,
	...props
}: React.ComponentProps<'td'>): JSX.Element {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				'tw:h-11 tw:px-5 tw:align-middle tw:whitespace-nowrap tw:[&:has([role=checkbox])]:pr-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<'caption'>): JSX.Element {
	return (
		<caption
			data-slot="table-caption"
			className={cn('tw:mt-4 tw:text-sm tw:text-muted-foreground', className)}
			{...props}
		/>
	);
}

export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableHead,
	TableRow,
	TableCell,
	TableCaption,
};
