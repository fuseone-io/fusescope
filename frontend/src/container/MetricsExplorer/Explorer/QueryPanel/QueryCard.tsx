import { ReactNode } from 'react';
import { MetricsSelect } from 'components/QueryBuilderV2/QueryV2/MetricsSelect/MetricsSelect';
import { useMetricSelectAddon } from 'components/QueryBuilderV2/QueryV2/MetricsSelect/MetricSelectAddonContext';
import QuerySearch from 'components/QueryBuilderV2/QueryV2/QuerySearch/QuerySearch';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { useQueryOperations } from 'hooks/queryBuilder/useQueryBuilderOperations';
import { cn } from 'lib/utils';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import AggregationFields from './AggregationFields';
import CardHead from './CardHead';
import EditorActions from './EditorActions';
import FunctionsSection from './FunctionsSection';
import ResultFields from './ResultFields';
import { cardSummary, summarizeQuery } from './summary';

interface QueryCardProps {
	query: IBuilderQuery;
	index: number;
	isOpen: boolean;
	/** Bumped by Reset so the fields re-read the restored query. */
	editorKey: number;
	onToggleOpen: () => void;
	onToggleVisibility: () => void;
	actionsMenu: ReactNode;
	onReset: () => void;
}

/** A metrics query as a card: its summary when collapsed, its fields when open. */
function QueryCard({
	query,
	index,
	isOpen,
	editorKey,
	onToggleOpen,
	onToggleVisibility,
	actionsMenu,
	onReset,
}: QueryCardProps): JSX.Element {
	const metricSelectAddon = useMetricSelectAddon();
	// The builder's own filter handler, with its version.
	const { handleChangeQueryData } = useQueryOperations({
		index,
		query,
		entityVersion: 'v3',
	});
	const summary = summarizeQuery(query);

	return (
		<div
			className={cn('qcard', query.disabled && 'off')}
			data-testid={`query-card-${query.queryName}`}
		>
			<CardHead
				letter={query.queryName}
				title={summary.metric || 'Select a metric'}
				summary={isOpen ? '' : cardSummary(summary)}
				isOpen={isOpen}
				isHidden={Boolean(query.disabled)}
				onToggleOpen={onToggleOpen}
				onToggleVisibility={onToggleVisibility}
				actions={actionsMenu}
			/>
			{isOpen && (
				<div className="qbody" key={editorKey}>
					<div className="field">
						<span className="flabel">Metric</span>
						<div className="fctl">
							<div className="sel qp-metric">
								<MetricsSelect
									query={query}
									index={index}
									version={ENTITY_VERSION_V5}
									signalSource=""
									onSignalSourceChange={(): void => {}}
									signalSourceChangeEnabled={false}
									savePreviousQuery={false}
								/>
								{summary.metricType && (
									<span className="qp-type">{summary.metricType}</span>
								)}
							</div>
							{metricSelectAddon?.(query)}
						</div>
					</div>
					<div className="field">
						<span className="flabel">Where</span>
						<div className="where" data-testid={`query-where-${query.queryName}`}>
							<QuerySearch
								key={`query-search-${query.queryName}-${query.dataSource}`}
								onChange={(value): void =>
									handleChangeQueryData('filter', { expression: value })
								}
								queryData={query}
								dataSource={DataSource.METRICS}
								signalSource=""
								placeholder="key = value"
							/>
						</div>
					</div>
					<div className="qsec">
						<span className="esec">Aggregation</span>
						<AggregationFields query={query} index={index} />
					</div>
					<FunctionsSection query={query} index={index} />
					<div className="qsec">
						<span className="esec">Result</span>
						<ResultFields query={query} index={index} />
					</div>
					<EditorActions
						letter={query.queryName}
						onReset={onReset}
						onDone={onToggleOpen}
					/>
				</div>
			)}
		</div>
	);
}

export default QueryCard;
