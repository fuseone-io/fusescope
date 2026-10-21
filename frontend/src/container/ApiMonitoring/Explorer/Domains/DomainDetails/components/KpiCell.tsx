import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface KpiCellProps {
	label: string;
	children: ReactNode;
	testId?: string;
	mono?: boolean;
	className?: string;
}

/** A `KpiStrip` cell sized for the domain page's six-up strip. */
function KpiCell({
	label,
	children,
	testId,
	mono = false,
	className,
}: KpiCellProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:bg-surface-raised tw:px-5 tw:py-3.5"
		>
			<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
				{label}
			</span>
			<span
				className={cn(
					'tw:truncate tw:text-2xl tw:leading-[1.15] tw:font-semibold tw:tracking-[-0.02em] tw:tabular-nums',
					mono && 'tw:font-mono tw:text-lg tw:font-medium tw:tracking-normal',
					className,
				)}
			>
				{children}
			</span>
		</div>
	);
}

export default KpiCell;
