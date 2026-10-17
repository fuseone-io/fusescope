import { cn } from 'lib/utils';

function Skeleton({
	className,
	...props
}: React.ComponentProps<'div'>): JSX.Element {
	return (
		<div
			data-slot="skeleton"
			className={cn('tw:animate-pulse tw:rounded-md tw:bg-accent', className)}
			{...props}
		/>
	);
}

export { Skeleton };
