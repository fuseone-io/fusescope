import { ReactNode } from 'react';

interface ChartGridProps {
	children: ReactNode;
}

/** Two charts a row on wide screens, one on narrow ones. */
function ChartGrid({ children }: ChartGridProps): JSX.Element {
	return (
		<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] tw:gap-4">
			{children}
		</div>
	);
}

export default ChartGrid;
