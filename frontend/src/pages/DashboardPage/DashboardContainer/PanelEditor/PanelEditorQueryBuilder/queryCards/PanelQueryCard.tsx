import type { QueryPresentationArgs } from 'components/QueryBuilderV2/QueryPresenterContext';
import CardHead from 'container/MetricsExplorer/Explorer/QueryPanel/CardHead';
import QuerySection from 'container/MetricsExplorer/Explorer/QueryPanel/QuerySection';
import { functionsSummary } from 'container/MetricsExplorer/Explorer/QueryPanel/summary';
import { cn } from 'lib/utils';

import {
	panelAggregationSummary,
	panelQueryCardSummary,
	panelQueryTitle,
	panelResultSummary,
} from './panelQuerySummary';

export const QUERY_SECTIONS_KEY = 'panelEditorQuerySections';

interface PanelQueryCardProps extends Pick<
	QueryPresentationArgs,
	| 'query'
	| 'parts'
	| 'onToggleVisibility'
	| 'canToggleVisibility'
	| 'actionsMenu'
> {
	isOpen: boolean;
	onToggleOpen: () => void;
}

/**
 * A builder query as a card: its summary when collapsed; open, the builder's own
 * controls grouped into source, filter and collapsible sections.
 */
function PanelQueryCard({
	query,
	parts,
	onToggleVisibility,
	canToggleVisibility,
	actionsMenu,
	isOpen,
	onToggleOpen,
}: PanelQueryCardProps): JSX.Element {
	const name = query.queryName;
	const resultSummary = panelResultSummary(query);

	return (
		<div
			className={cn('qcard', query.disabled && 'off')}
			data-testid={`query-card-${name}`}
		>
			<CardHead
				letter={name}
				title={panelQueryTitle(query)}
				summary={isOpen ? '' : panelQueryCardSummary(query)}
				isOpen={isOpen}
				isHidden={Boolean(query.disabled)}
				isVisibilityDisabled={!canToggleVisibility}
				onToggleOpen={onToggleOpen}
				onToggleVisibility={onToggleVisibility}
				actions={actionsMenu}
			/>
			{isOpen && (
				<div className="qbody">
					{(parts.dataSource || parts.metric) && (
						<div className="pq-source-row">
							{parts.dataSource && (
								<div className="field">
									<span className="flabel">Source</span>
									<div className="pq-source">{parts.dataSource}</div>
								</div>
							)}
							{parts.metric && (
								<div className="field">
									<span className="flabel">Metric</span>
									<div className="pq-metric">{parts.metric}</div>
								</div>
							)}
						</div>
					)}
					<div className="field">
						<span className="flabel">Where</span>
						<div className="pq-where" data-testid={`query-where-${name}`}>
							{parts.search}
						</div>
					</div>
					{parts.aggregation && (
						<QuerySection
							name={name}
							kind="aggregation"
							title="Aggregation"
							summary={panelAggregationSummary(query)}
							isSet
							storageKey={QUERY_SECTIONS_KEY}
						>
							<div className="pq-aggregation">{parts.aggregation}</div>
						</QuerySection>
					)}
					{parts.functions && (
						<QuerySection
							name={name}
							kind="functions"
							title="Functions"
							hint="applied in order, top to bottom"
							summary={functionsSummary(query)}
							isSet={Boolean(query.functions?.length)}
							storageKey={QUERY_SECTIONS_KEY}
						>
							<div className="qp-functions">{parts.functions}</div>
						</QuerySection>
					)}
					{parts.addOns && (
						<QuerySection
							name={name}
							kind="result"
							title="Result"
							summary={resultSummary}
							isSet={resultSummary !== 'Defaults'}
							storageKey={QUERY_SECTIONS_KEY}
						>
							<div className="pq-addons">{parts.addOns}</div>
						</QuerySection>
					)}
				</div>
			)}
		</div>
	);
}

export default PanelQueryCard;
