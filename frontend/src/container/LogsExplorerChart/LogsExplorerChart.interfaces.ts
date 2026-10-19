import { QueryData } from 'types/api/widgets/getQuery';

export type LogsExplorerChartProps = {
	data: QueryData[];
	isLoading: boolean;
	isLogsExplorerViews?: boolean;
	isLabelEnabled?: boolean;
	className?: string;
	isShowingLiveLogs?: boolean;
	/** Renders a compact legend here, in place of the one under the chart. */
	legendTarget?: HTMLElement | null;
};
