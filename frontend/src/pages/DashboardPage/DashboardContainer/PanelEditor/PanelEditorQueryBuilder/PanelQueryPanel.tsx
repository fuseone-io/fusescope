import type { ReactNode } from 'react';
import { QueryBuilderV2 } from 'components/QueryBuilderV2/QueryBuilderV2';
import { QueryPresenterProvider } from 'components/QueryBuilderV2/QueryPresenterContext';
import TextToolTip from 'components/TextToolTip';
import { Button } from 'components/ui/button';
import RunQueryBtn from 'container/QueryBuilder/components/RunQueryBtn/RunQueryBtn';
import ClickHouseQueryContainer from 'container/QueryBuilder/rawQueryEditors/ClickHouse';
import PromQLQueryContainer from 'container/QueryBuilder/rawQueryEditors/PromQL';
import { countLabel } from 'container/MetricsExplorer/Explorer/QueryPanel/summary';
import {
	formatLastRun,
	useLastRun,
} from 'container/MetricsExplorer/Explorer/QueryPanel/useLastRun';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { getQueryMode } from 'lib/query/queryMode';
import { cn } from 'lib/utils';
import { PanelLeftClose } from 'lucide-react';
import { QueryMode } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import { getQueryModeSignals } from '../../Panels/types/panelCapabilities';
import type { RenderableQueryPanelDefinition } from '../../Panels/types/panelDefinition';
import { toPanelType } from '../../Panels/types/panelKind';
import type { PanelEditorChrome } from '../PanelEditorLayout/PanelEditorChromeContext';
import { usePanelQueryPresenter } from './queryCards/usePanelQueryPresenter';

import 'container/MetricsExplorer/Explorer/QueryPanel/QueryPanel.styles.scss';
import styles from './PanelQueryPanel.module.scss';

const MODE_LABEL: Record<QueryMode, { short: string; full: string }> = {
	[QueryMode.QUERY_BUILDER]: { short: 'Builder', full: 'Query Builder' },
	[QueryMode.CLICKHOUSE]: { short: 'ClickHouse', full: 'ClickHouse Query' },
	[QueryMode.PROM]: { short: 'PromQL', full: 'PromQL' },
	[QueryMode.AI_QUERY_BUILDER]: { short: 'AI', full: 'AI Query Builder' },
};

interface PanelQueryPanelProps {
	chrome: PanelEditorChrome;
	panelDefinition: RenderableQueryPanelDefinition;
	isRawQuery: boolean;
	onChangeQueryMode: (key: string) => void;
	isLoadingQueries: boolean;
	onStageRunQuery: () => void;
	onCancelQuery: () => void;
	footer?: ReactNode;
}

function queryCountLabel(
	mode: QueryMode,
	builder: { queries: number; formulas: number },
	raw: number,
): string {
	if (mode === QueryMode.CLICKHOUSE || mode === QueryMode.PROM) {
		return countLabel(raw, 0);
	}
	return countLabel(builder.queries, builder.formulas);
}

/**
 * The editor's left column: the query modes the kind supports, each query as a
 * card, then the add buttons and a sticky Run Query footer. Every editor inside
 * is the builder's own, so queries behave as in the tabbed builder.
 */
function PanelQueryPanel({
	chrome,
	panelDefinition,
	isRawQuery,
	onChangeQueryMode,
	isLoadingQueries,
	onStageRunQuery,
	onCancelQuery,
	footer,
}: PanelQueryPanelProps): JSX.Element {
	const { currentQuery } = useQueryBuilder();
	const presenter = usePanelQueryPresenter(chrome);
	const lastRun = useLastRun(isLoadingQueries);
	const panelType = toPanelType(panelDefinition.kind);
	const activeMode = getQueryMode(currentQuery);
	const modes = Object.keys(
		panelDefinition.supportedQueryModesKindMap,
	) as QueryMode[];

	const rawCount =
		activeMode === QueryMode.CLICKHOUSE
			? currentQuery.clickhouse_sql.length
			: currentQuery.promql.length;

	return (
		<section
			className={cn('panel-query-cards', styles.panel)}
			aria-label="Queries"
			data-testid="panel-editor-query-panel"
		>
			<div className="qpanel-h fs-ui">
				<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
					<Button
						variant="ghost"
						size="icon-sm"
						className="tw:text-muted-foreground"
						aria-label="Collapse query panel"
						data-testid="panel-editor-collapse-queries"
						onClick={chrome.collapseQueryPanel}
					>
						<PanelLeftClose />
					</Button>
					<h2 className="tw:m-0 tw:text-sm tw:font-semibold tw:text-foreground">
						Queries
					</h2>
					<span className="tw:text-xs tw:text-subtle-foreground">
						{queryCountLabel(
							activeMode,
							{
								queries: currentQuery.builder.queryData.length,
								formulas: currentQuery.builder.queryFormulas.length,
							},
							rawCount,
						)}
					</span>
				</div>
			</div>

			{modes.length > 1 && (
				<div className={cn('fs-ui', styles.modes)}>
					<div role="group" aria-label="Query type" className={styles.segmented}>
						{modes.map((mode) => (
							<button
								key={mode}
								type="button"
								title={MODE_LABEL[mode].full}
								aria-label={MODE_LABEL[mode].full}
								aria-pressed={mode === activeMode}
								data-testid={`panel-editor-query-mode-${mode}`}
								onClick={(): void => {
									if (mode !== activeMode) {
										onChangeQueryMode(mode);
									}
								}}
							>
								{MODE_LABEL[mode].short}
							</button>
						))}
					</div>
				</div>
			)}

			<div className={cn('qb-filter-field-skin', styles.body)}>
				{(activeMode === QueryMode.QUERY_BUILDER ||
					activeMode === QueryMode.AI_QUERY_BUILDER) && (
					<QueryPresenterProvider value={presenter}>
						{activeMode === QueryMode.QUERY_BUILDER ? (
							<QueryBuilderV2
								key={QueryMode.QUERY_BUILDER}
								panelType={panelType}
								fieldsConfig={panelDefinition.queryBuilderFields}
								allowedDataSources={getQueryModeSignals(
									panelDefinition.supportedQueryModesKindMap,
									QueryMode.QUERY_BUILDER,
								)}
								showTraceOperator={!isRawQuery}
								version="v3"
								isRawQuery={isRawQuery}
								signalSourceChangeEnabled
								savePreviousQuery
							/>
						) : (
							<QueryBuilderV2
								key={QueryMode.AI_QUERY_BUILDER}
								panelType={panelType}
								fieldsConfig={panelDefinition.queryBuilderFields}
								showTraceOperator={false}
								version="v3"
								isRawQuery={isRawQuery}
								config={{
									initialDataSource: DataSource.TRACES,
									queryVariant: 'static',
								}}
								savePreviousQuery
							/>
						)}
					</QueryPresenterProvider>
				)}
				{activeMode === QueryMode.CLICKHOUSE && (
					<div className={styles.rawEditor}>
						<ClickHouseQueryContainer />
					</div>
				)}
				{activeMode === QueryMode.PROM && (
					<div className={styles.rawEditor}>
						<PromQLQueryContainer />
					</div>
				)}
				{footer && <div className={styles.extra}>{footer}</div>}
			</div>

			<div className="qpanel-f fs-ui">
				<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:text-xs tw:text-subtle-foreground tw:tabular-nums">
					<span className="translate-safe">
						{lastRun ? formatLastRun(lastRun) : 'Not run yet'}
					</span>
					<TextToolTip text="This will temporarily save the current query and graph state. This will persist across tab change" />
				</span>
				<RunQueryBtn
					label="Run Query"
					onStageRunQuery={onStageRunQuery}
					isLoadingQueries={isLoadingQueries}
					handleCancelQuery={onCancelQuery}
				/>
			</div>
		</section>
	);
}

export default PanelQueryPanel;
