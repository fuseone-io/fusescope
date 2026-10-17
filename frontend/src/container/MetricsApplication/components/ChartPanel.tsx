import { ReactNode } from 'react';
import Panel from 'components/PageTemplate/components/Panel';

interface ChartPanelProps {
	children: ReactNode;
	testId?: string;
}

/** A fixed-height panel for one service chart; the chart draws its own header. */
function ChartPanel({ children, testId }: ChartPanelProps): JSX.Element {
	return (
		<Panel
			testId={testId}
			className="tw:h-[40vh] tw:overflow-hidden"
			bodyClassName="tw:h-full tw:p-2.5"
		>
			{children}
		</Panel>
	);
}

export default ChartPanel;
