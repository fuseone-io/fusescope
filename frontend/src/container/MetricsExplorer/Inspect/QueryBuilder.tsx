import { ReactNode, useCallback } from 'react';
import RunQueryBtn from 'container/QueryBuilder/components/RunQueryBtn/RunQueryBtn';
import { cn } from 'lib/utils';

import MetricFilters from './MetricFilters';
import MetricNameSearch from './MetricNameSearch';
import MetricSpaceAggregation from './MetricSpaceAggregation';
import MetricTimeAggregation from './MetricTimeAggregation';
import StepNumber, { StepState } from './StepNumber';
import { InspectionStep, QueryBuilderProps } from './types';

function QueryStep({
	number,
	state,
	children,
}: {
	number: number;
	state: StepState;
	children: ReactNode;
}): JSX.Element {
	return (
		<div
			data-testid="inspect-query-step"
			data-step={number}
			data-state={state}
			className={cn(
				'inspect-query-step tw:grid tw:grid-cols-[28px_minmax(0,1fr)] tw:items-start tw:gap-x-3 tw:border-b tw:border-border tw:px-4 tw:py-3.5 tw:last:border-b-0',
				state === 'current' && 'tw:bg-primary-soft',
			)}
		>
			<span className="fs-ui tw:pt-1">
				<StepNumber number={number} state={state} />
			</span>
			<div className="tw:min-w-0">{children}</div>
		</div>
	);
}

function aggregationState(
	inspectionStep: InspectionStep,
	step: InspectionStep,
): StepState {
	if (inspectionStep > step) {
		return 'done';
	}
	return inspectionStep === step ? 'current' : 'pending';
}

function QueryBuilder({
	currentMetricName,
	setCurrentMetricName,
	setAppliedMetricName,
	spaceAggregationLabels,
	currentMetricInspectionOptions,
	dispatchMetricInspectionOptions,
	inspectionStep,
	inspectMetricsTimeSeries,
	currentQuery,
	setCurrentQuery,
	isLoadingQueries,
	handleCancelQuery,
	onRunQuery,
}: QueryBuilderProps): JSX.Element {
	const applyInspectionOptions = useCallback(() => {
		onRunQuery?.();
		setAppliedMetricName(currentMetricName ?? '');
		dispatchMetricInspectionOptions({
			type: 'APPLY_METRIC_INSPECTION_OPTIONS',
		});
	}, [
		currentMetricName,
		setAppliedMetricName,
		dispatchMetricInspectionOptions,
		onRunQuery,
	]);

	return (
		<section
			aria-labelledby="inspect-query-title"
			className="inspect-metrics-query-builder tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised"
		>
			<div className="fs-ui tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-4 tw:py-2.5 tw:font-sans">
				<h2
					id="inspect-query-title"
					className="tw:text-sm tw:font-semibold tw:text-foreground"
				>
					Query
				</h2>
				<RunQueryBtn
					onStageRunQuery={applyInspectionOptions}
					handleCancelQuery={handleCancelQuery}
					isLoadingQueries={isLoadingQueries}
				/>
			</div>
			<QueryStep number={1} state="done">
				<MetricNameSearch
					currentMetricName={currentMetricName}
					setCurrentMetricName={setCurrentMetricName}
				/>
			</QueryStep>
			<QueryStep number={2} state="done">
				<MetricFilters
					dispatchMetricInspectionOptions={dispatchMetricInspectionOptions}
					currentQuery={currentQuery}
					setCurrentQuery={setCurrentQuery}
				/>
			</QueryStep>
			<QueryStep
				number={3}
				state={aggregationState(inspectionStep, InspectionStep.TIME_AGGREGATION)}
			>
				<MetricTimeAggregation
					inspectionStep={inspectionStep}
					currentMetricInspectionOptions={currentMetricInspectionOptions}
					dispatchMetricInspectionOptions={dispatchMetricInspectionOptions}
					inspectMetricsTimeSeries={inspectMetricsTimeSeries}
				/>
			</QueryStep>
			<QueryStep
				number={4}
				state={aggregationState(inspectionStep, InspectionStep.SPACE_AGGREGATION)}
			>
				<MetricSpaceAggregation
					inspectionStep={inspectionStep}
					spaceAggregationLabels={spaceAggregationLabels}
					currentMetricInspectionOptions={currentMetricInspectionOptions}
					dispatchMetricInspectionOptions={dispatchMetricInspectionOptions}
				/>
			</QueryStep>
		</section>
	);
}

export default QueryBuilder;
