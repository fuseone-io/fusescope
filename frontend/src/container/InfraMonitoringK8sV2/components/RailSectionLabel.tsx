import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface RailSectionLabelProps {
	children: ReactNode;
	action?: ReactNode;
	className?: string;
}

function RailSectionLabel({
	children,
	action,
	className,
}: RailSectionLabelProps): JSX.Element {
	return (
		<div
			className={cn(
				'fs-ui tw:flex tw:min-h-8 tw:items-center tw:justify-between tw:gap-2 tw:font-sans',
				className,
			)}
		>
			<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-subtle-foreground tw:uppercase">
				{children}
			</span>
			{action}
		</div>
	);
}

export default RailSectionLabel;
