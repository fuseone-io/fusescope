import { Terminal } from '@signozhq/icons';
import { Button, Tooltip } from 'antd';
import cx from 'classnames';
import { ChartLine, ChartNoAxesGantt, List, Table } from 'lucide-react';
import { ExplorerViews } from 'pages/LogsExplorer/utils';

import './ToolbarActions.styles.scss';

interface LeftToolbarActionsProps {
	items: any;
	selectedView: string;
	onChangeSelectedView: (view: ExplorerViews) => void;
	showFilter: boolean;
	handleFilterVisibilityChange: () => void;
}

const activeTab = 'active-tab';

export default function LeftToolbarActions({
	items,
	selectedView,
	onChangeSelectedView,
}: LeftToolbarActionsProps): JSX.Element {
	const { clickhouse, list, timeseries, table, trace } = items;

	return (
		<div className="left-toolbar">
			<div className="left-toolbar-query-actions">
				{list?.show && (
					<Tooltip title="List View">
						<Button
							disabled={list.disabled}
							className={cx(
								'list-view-tab',
								'explorer-view-option',
								selectedView === list.key ? activeTab : '',
							)}
							onClick={(): void => onChangeSelectedView(list.key)}
						>
							<List size={14} data-testid="search-view" />
							List
						</Button>
					</Tooltip>
				)}

				{trace?.show && (
					<Tooltip title="Trace View">
						<Button
							disabled={trace.disabled}
							className={cx(
								'trace-view-tab',
								'explorer-view-option',
								selectedView === trace.key ? activeTab : '',
							)}
							onClick={(): void => onChangeSelectedView(trace.key)}
						>
							<ChartNoAxesGantt size={14} data-testid="trace-view" />
							Traces
						</Button>
					</Tooltip>
				)}

				{timeseries?.show && (
					<Tooltip title="Time Series">
						<Button
							disabled={timeseries.disabled}
							className={cx(
								'timeseries-view-tab',
								'explorer-view-option',
								selectedView === timeseries.key ? activeTab : '',
							)}
							onClick={(): void => onChangeSelectedView(timeseries.key)}
						>
							<ChartLine size={14} data-testid="query-builder-view" />
							Time series
						</Button>
					</Tooltip>
				)}

				{clickhouse?.show && (
					<Tooltip title="Clickhouse">
						<Button
							disabled={clickhouse.disabled}
							className={cx(
								'clickhouse-view-tab',
								'explorer-view-option',
								selectedView === clickhouse.key ? activeTab : '',
							)}
							onClick={(): void => onChangeSelectedView(clickhouse.key)}
						>
							<Terminal size={14} data-testid="clickhouse-view" />
							Clickhouse
						</Button>
					</Tooltip>
				)}

				{table?.show && (
					<Tooltip title="Table">
						<Button
							disabled={table.disabled}
							className={cx(
								'table-view-tab',
								'explorer-view-option',
								selectedView === table.key ? activeTab : '',
							)}
							onClick={(): void => onChangeSelectedView(table.key)}
						>
							<Table size={14} data-testid="query-builder-view-v2" />
							Table
						</Button>
					</Tooltip>
				)}
			</div>
		</div>
	);
}
