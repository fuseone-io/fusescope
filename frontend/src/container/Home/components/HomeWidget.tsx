import { ReactNode } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Skeleton } from 'components/ui/skeleton';

const SKELETON_ROWS = ['a', 'b', 'c', 'd'];

interface HomeWidgetProps {
	title: string;
	subtitle?: ReactNode;
	actions?: ReactNode;
	/** Loading and failed requests both show the skeleton. */
	pending?: boolean;
	testId?: string;
	className?: string;
	children?: ReactNode;
}

function HomeWidget({
	title,
	subtitle,
	actions,
	pending = false,
	testId,
	className,
	children,
}: HomeWidgetProps): JSX.Element {
	return (
		<ContentPanel
			title={title}
			subtitle={subtitle}
			actions={pending ? undefined : actions}
			testId={testId}
			className={className}
		>
			{pending ? (
				<div
					data-testid="home-widget-loading"
					className="fs-ui tw:flex tw:flex-col tw:gap-3 tw:px-5 tw:pt-1 tw:pb-5"
				>
					{SKELETON_ROWS.map((row) => (
						<Skeleton key={row} className="tw:h-5 tw:bg-muted" />
					))}
				</div>
			) : (
				children
			)}
		</ContentPanel>
	);
}

export default HomeWidget;
