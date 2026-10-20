import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryBuilderV2Context } from 'components/QueryBuilderV2/QueryBuilderV2Context';
import { ATTRIBUTE_TYPES, PANEL_TYPES } from 'constants/queryBuilder';
import SpaceAggregationOptions from 'container/QueryBuilder/components/SpaceAggregationOptions/SpaceAggregationOptions';
import { GroupByFilter, OperatorsSelect } from 'container/QueryBuilder/filters';
import { useQueryOperations } from 'hooks/queryBuilder/useQueryBuilderOperations';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { MetricAggregation } from 'types/api/v5/queryRange';

interface AggregationFieldsProps {
	query: IBuilderQuery;
	index: number;
}

/**
 * The aggregation section: the same controls and handlers as the builder's
 * metrics aggregation row, with their labels above them.
 */
function AggregationFields({
	query,
	index,
}: AggregationFieldsProps): JSX.Element {
	const { setAggregationOptions } = useQueryBuilderV2Context();
	const {
		operators,
		spaceAggregationOptions,
		handleChangeQueryData,
		handleChangeOperator,
		handleSpaceAggregationChange,
	} = useQueryOperations({ index, query, entityVersion: 'v4' });

	const aggregation = useMemo(
		() => query.aggregations?.[0] as MetricAggregation,
		[query.aggregations],
	);
	const isHistogram =
		query.aggregateAttribute?.type === ATTRIBUTE_TYPES.HISTOGRAM;
	const noMetric = !aggregation?.metricName;

	useEffect(() => {
		setAggregationOptions(query.queryName, [
			{
				func: aggregation?.spaceAggregation || 'count',
				arg: aggregation?.metricName || '',
			},
		]);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [aggregation?.spaceAggregation, aggregation?.metricName, query.queryName]);

	// Same as the builder's step input: free text, sent as a number.
	const [step, setStep] = useState(
		query.stepInterval ? String(query.stepInterval) : '',
	);
	const handleStep = useCallback(
		(event: ChangeEvent<HTMLInputElement>): void => {
			setStep(event.target.value);
			handleChangeQueryData('stepInterval', Number(event.target.value));
		},
		[handleChangeQueryData],
	);

	return (
		<div className="egrid">
			<div className="field">
				<span className="flabel">
					Over time <span className="fhint">within each series</span>
				</span>
				<div className="fctl">
					{!isHistogram && (
						<OperatorsSelect
							value={aggregation?.timeAggregation || ''}
							onChange={handleChangeOperator}
							operators={operators}
							className="qp-sel qp-sel--grow"
						/>
					)}
					<span className="kw">every</span>
					<input
						className="inp num"
						aria-label="Step interval"
						data-testid="query-step"
						placeholder="Auto"
						value={step}
						onChange={handleStep}
					/>
				</div>
			</div>
			<div className="field">
				<span className="flabel">
					Across series <span className="fhint">combine into groups</span>
				</span>
				<div className="fctl">
					<div className="qp-sel qp-sel--space">
						<SpaceAggregationOptions
							panelType={PANEL_TYPES.TIME_SERIES}
							key={`${aggregation?.spaceAggregation}${aggregation?.timeAggregation}`}
							aggregatorAttributeType={
								query.aggregateAttribute?.type as ATTRIBUTE_TYPES
							}
							selectedValue={aggregation?.spaceAggregation || ''}
							disabled={noMetric}
							onSelect={handleSpaceAggregationChange}
							operators={spaceAggregationOptions}
							qbVersion="v3"
						/>
					</div>
					<span className="kw">by</span>
					<div className="qp-sel qp-sel--grow qp-groupby">
						<GroupByFilter
							disabled={noMetric}
							query={query}
							onChange={(value): void => handleChangeQueryData('groupBy', value)}
							placeholder="add key"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

export default AggregationFields;
