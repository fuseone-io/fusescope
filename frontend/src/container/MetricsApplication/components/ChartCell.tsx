import { ReactNode } from 'react';

interface ChartCellProps {
	children: ReactNode;
}

/**
 * Positioning context for a chart's click popup ("View traces"…), which sits
 * next to the panel rather than inside it so the panel can't clip it.
 */
function ChartCell({ children }: ChartCellProps): JSX.Element {
	return <div className="tw:relative tw:min-w-0">{children}</div>;
}

export default ChartCell;
