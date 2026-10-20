import { ReactNode } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';

interface ChartPanelProps {
	children: ReactNode;
	testId?: string;
}

/** A fixed-height `rounded-xl` panel for one service chart; the chart draws its own header. */
function ChartPanel({ children, testId }: ChartPanelProps): JSX.Element {
	return (
		<ContentPanel
			testId={testId}
			className="tw:h-[340px]"
			bodyClassName="tw:min-h-0 tw:px-3 tw:pt-2 tw:pb-3"
		>
			{children}
		</ContentPanel>
	);
}

export default ChartPanel;
