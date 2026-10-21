import { ReactNode } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { cn } from 'lib/utils';

const HEIGHTS = {
	mini: 'tw:h-[200px]',
	small: 'tw:h-[260px]',
	medium: 'tw:h-[320px]',
	large: 'tw:h-[400px]',
} as const;

interface MQChartPanelProps {
	children: ReactNode;
	height?: keyof typeof HEIGHTS;
	/** A title row above a chart that draws no header of its own. */
	title?: ReactNode;
	actions?: ReactNode;
	footer?: ReactNode;
	testId?: string;
	className?: string;
}

/**
 * A fixed-height `rounded-xl` panel for one messaging-queue chart. Charts from
 * `GridCard` draw their own title, so the panel has no header unless given one.
 */
function MQChartPanel({
	children,
	height = 'medium',
	title,
	actions,
	footer,
	testId,
	className,
}: MQChartPanelProps): JSX.Element {
	return (
		<ContentPanel
			testId={testId}
			title={title}
			actions={actions}
			footer={footer}
			className={cn(HEIGHTS[height], className)}
			bodyClassName="tw:min-h-0 tw:px-3 tw:pt-2 tw:pb-3 tw:[&>.ant-card]:h-full tw:[&>div]:h-full"
		>
			{children}
		</ContentPanel>
	);
}

export default MQChartPanel;
