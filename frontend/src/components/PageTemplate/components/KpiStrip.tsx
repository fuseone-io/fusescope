import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface KpiStripProps {
	/** Accessible name of the region. */
	label: string;
	children: ReactNode;
	testId?: string;
	className?: string;
}

/** `Stat` cells in one rounded border, separated by 1px lines. */
function KpiStrip({
	label,
	children,
	testId = 'kpi-strip',
	className,
}: KpiStripProps): JSX.Element {
	return (
		<section
			aria-label={label}
			data-testid={testId}
			className={cn(
				'fs-ui tw:grid tw:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] tw:gap-px tw:overflow-hidden tw:rounded-lg tw:border tw:border-border tw:bg-border tw:font-sans tw:text-foreground',
				className,
			)}
		>
			{children}
		</section>
	);
}

export default KpiStrip;
