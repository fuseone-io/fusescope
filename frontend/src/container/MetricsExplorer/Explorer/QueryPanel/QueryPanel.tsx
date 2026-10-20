import { ReactNode } from 'react';
import { QueryBuilderV2 } from 'components/QueryBuilderV2/QueryBuilderV2';
import {
	MetricSelectAddon,
	MetricSelectAddonProvider,
} from 'components/QueryBuilderV2/QueryV2/MetricsSelect/MetricSelectAddonContext';
import { QueryPresenterProvider } from 'components/QueryBuilderV2/QueryPresenterContext';
import { Button } from 'components/ui/button';
import { PANEL_TYPES } from 'constants/queryBuilder';
import RightToolbarActions from 'container/QueryBuilder/components/ToolbarActions/RightToolbarActions';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { PanelLeftClose, Plus, Sigma } from 'lucide-react';
import { DataSource } from 'types/common/queryBuilder';

import { countLabel } from './summary';
import { formatLastRun, LastRun } from './useLastRun';
import { usePanelPresenter } from './usePanelPresenter';

export interface QueryPanelProps {
	metricSelectAddon: MetricSelectAddon;
	isLoadingQueries: boolean;
	lastRun: LastRun | null;
	onRun: () => void;
	onCancel: () => void;
	/** Shown beside Run query, e.g. a query warning. */
	runAdornment?: ReactNode;
}

interface Props extends QueryPanelProps {
	onCollapse: () => void;
	presenter: ReturnType<typeof usePanelPresenter>;
}

/** The query panel: cards for every query and formula, then add and run. */
function QueryPanel({
	metricSelectAddon,
	isLoadingQueries,
	lastRun,
	onRun,
	onCancel,
	runAdornment,
	onCollapse,
	presenter,
}: Props): JSX.Element {
	const { currentQuery, addNewBuilderQuery, addNewFormula } = useQueryBuilder();

	return (
		<>
			<div className="qpanel-h fs-ui">
				<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
					<Button
						variant="ghost"
						size="icon-sm"
						className="tw:text-muted-foreground"
						aria-label="Collapse query panel"
						onClick={onCollapse}
					>
						<PanelLeftClose />
					</Button>
					<h2 className="tw:text-sm tw:font-semibold tw:text-foreground">Queries</h2>
					<span
						className="tw:text-xs tw:text-subtle-foreground"
						data-testid="query-panel-count"
					>
						{countLabel(
							currentQuery.builder.queryData.length,
							currentQuery.builder.queryFormulas.length,
						)}
					</span>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={(): void => presenter.setAllOpen(!presenter.isAnyOpen)}
				>
					{presenter.isAnyOpen ? 'Collapse all' : 'Expand all'}
				</Button>
			</div>
			<div className="qpanel-body" data-testid="query-panel-body">
				<QueryPresenterProvider value={presenter.presenter}>
					<MetricSelectAddonProvider value={metricSelectAddon}>
						<QueryBuilderV2
							config={{
								initialDataSource: DataSource.METRICS,
								queryVariant: 'static',
							}}
							panelType={PANEL_TYPES.TIME_SERIES}
							showFunctions={false}
							version="v3"
						/>
					</MetricSelectAddonProvider>
				</QueryPresenterProvider>
			</div>
			<div className="qpanel-f fs-ui">
				<div className="tw:flex tw:items-center tw:gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={(): void => addNewBuilderQuery()}
					>
						<Plus />
						Add query
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="qp-add"
						onClick={(): void => addNewFormula()}
					>
						<Sigma />
						Add formula
					</Button>
				</div>
				<div className="tw:flex tw:items-center tw:gap-3">
					{lastRun && (
						<span
							className="tw:text-xs tw:text-subtle-foreground tw:tabular-nums"
							data-testid="query-panel-last-run"
						>
							{formatLastRun(lastRun)}
						</span>
					)}
					{runAdornment}
					<RightToolbarActions
						onStageRunQuery={onRun}
						isLoadingQueries={isLoadingQueries}
						handleCancelQuery={onCancel}
					/>
				</div>
			</div>
		</>
	);
}

export default QueryPanel;
