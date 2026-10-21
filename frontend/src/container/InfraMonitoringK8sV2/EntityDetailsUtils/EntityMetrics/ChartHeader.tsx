import { Ref } from 'react';
import { Link } from 'react-router-dom';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Compass } from 'lucide-react';

import InfoTooltip from '../../components/InfoTooltip';

interface ChartHeaderProps {
	title: string;
	tooltip?: string;
	metricsExplorerUrl?: string;
	metricsExplorerTestId?: string;
	onExploreClick?: () => void;
	/** Where the chart portals its legend. */
	legendRef?: Ref<HTMLDivElement>;
}

function ChartHeader({
	title,
	tooltip,
	metricsExplorerUrl,
	metricsExplorerTestId = 'open-metrics-explorer',
	onExploreClick,
	legendRef,
}: ChartHeaderProps): JSX.Element {
	return (
		<div
			className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-x-3 tw:gap-y-1.5 tw:px-5 tw:pt-3 tw:font-sans"
			data-testid="chart-header"
		>
			<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-wrap tw:items-center tw:gap-x-3.5 tw:gap-y-1">
				<h3 className="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-semibold tw:text-foreground">
					{title}
					{tooltip && (
						<InfoTooltip title={tooltip} testId="chart-header-info-icon" />
					)}
				</h3>
				<div ref={legendRef} className="tw:min-w-0 tw:empty:hidden" />
			</div>
			{metricsExplorerUrl && (
				<TitleTooltip title="Open in Metrics Explorer">
					<Link
						to={metricsExplorerUrl}
						aria-label="Open in Metrics Explorer"
						className="tw:inline-flex tw:size-7 tw:flex-none tw:items-center tw:justify-center tw:rounded-md tw:text-muted-foreground! tw:hover:bg-muted tw:hover:text-foreground!"
						data-testid={metricsExplorerTestId}
						onClick={onExploreClick}
					>
						<Compass size={14} />
					</Link>
				</TitleTooltip>
			)}
		</div>
	);
}

export default ChartHeader;
