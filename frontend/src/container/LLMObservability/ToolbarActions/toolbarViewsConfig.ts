import { Terminal } from '@signozhq/icons';
import {
	ChartLine,
	ChartNoAxesGantt,
	List,
	LucideIcon,
	Table,
} from 'lucide-react';
import { ExplorerViews } from 'pages/LogsExplorer/utils';

export interface ToolbarViewConfig {
	icon: LucideIcon | typeof Terminal;
	label: string;
	tooltip: string;
	className: string;
	testId: string;
}

export const TOOLBAR_VIEW_CONFIG: Record<string, ToolbarViewConfig> = {
	[ExplorerViews.LIST]: {
		icon: List,
		label: 'List',
		tooltip: 'List View',
		className: 'list-view-tab',
		testId: 'search-view',
	},
	[ExplorerViews.TRACE]: {
		icon: ChartNoAxesGantt,
		label: 'Traces',
		tooltip: 'Trace View',
		className: 'trace-view-tab',
		testId: 'trace-view',
	},
	[ExplorerViews.TIMESERIES]: {
		icon: ChartLine,
		label: 'Time series',
		tooltip: 'Time Series',
		className: 'timeseries-view-tab',
		testId: 'query-builder-view',
	},
	[ExplorerViews.CLICKHOUSE]: {
		icon: Terminal,
		label: 'Clickhouse',
		tooltip: 'Clickhouse',
		className: 'clickhouse-view-tab',
		testId: 'clickhouse-view',
	},
	[ExplorerViews.TABLE]: {
		icon: Table,
		label: 'Table',
		tooltip: 'Table',
		className: 'table-view-tab',
		testId: 'query-builder-view-v2',
	},
};
