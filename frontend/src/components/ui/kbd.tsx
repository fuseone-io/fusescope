import { cn } from 'lib/utils';

function Kbd({
	className,
	...props
}: React.ComponentProps<'kbd'>): JSX.Element {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				'tw:pointer-events-none tw:inline-flex tw:h-5 tw:w-fit tw:min-w-5 tw:items-center tw:justify-center tw:gap-1 tw:rounded-sm tw:bg-muted tw:px-1 tw:font-sans tw:text-xs tw:font-medium tw:text-muted-foreground tw:select-none',
				'tw:[&_svg:not([class*=size-])]:size-3',
				'tw:[[data-slot=tooltip-content]_&]:bg-background/20 tw:[[data-slot=tooltip-content]_&]:text-background tw:dark:[[data-slot=tooltip-content]_&]:bg-background/10',
				className,
			)}
			{...props}
		/>
	);
}

function KbdGroup({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<kbd
			data-slot="kbd-group"
			className={cn('tw:inline-flex tw:items-center tw:gap-1', className)}
			{...props}
		/>
	);
}

export { Kbd, KbdGroup };
