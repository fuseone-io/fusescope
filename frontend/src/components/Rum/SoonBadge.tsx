import { cn } from 'lib/utils';

interface SoonBadgeProps {
	label?: string;
	className?: string;
}

function SoonBadge({ label = 'Soon', className }: SoonBadgeProps): JSX.Element {
	return (
		<span
			className={cn(
				'tw:inline-flex tw:h-4 tw:items-center tw:rounded-sm tw:bg-surface-sunken tw:px-1.5 tw:text-[10px] tw:font-medium tw:text-muted-foreground',
				className,
			)}
		>
			{label}
		</span>
	);
}

export default SoonBadge;
