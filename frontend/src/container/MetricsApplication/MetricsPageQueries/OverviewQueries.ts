import { OPERATORS } from 'constants/queryBuilder';
import {
	BaseAutocompleteData,
	DataTypes,
} from 'types/api/queryBuilder/queryAutocompleteResponse';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';
import {
	DataSource,
	MetricAggregateOperator,
	QueryBuilderData,
	TracesAggregatorOperator,
} from 'types/common/queryBuilder';

import {
	FORMULA,
	GraphTitle,
	LATENCY_AGGREGATEOPERATOR,
	LATENCY_AGGREGATEOPERATOR_SPAN_METRICS,
	MetricsType,
	OPERATION_LEGENDS,
	QUERYNAME_AND_EXPRESSION,
	WidgetKeys,
} from '../constant';
import {
	ApDexMetricsQueryBuilderQueriesProps,
	ApDexProps,
	LatencyProps,
	OperationPerSecProps,
} from '../Tabs/types';
import { convertMilSecToNanoSec, getNearestHighestBucketValue } from '../utils';
import {
	getQueryBuilderQueries,
	getQueryBuilderQuerieswithFormula,
} from './MetricsPageQueriesFactory';

export const latency = ({
	servicename,
	tagFilterItems,
	isSpanMetricEnable = false,
	topLevelOperationsRoute,
}: LatencyProps): QueryBuilderData => {
	const signozLatencyBucketMetrics = WidgetKeys.SignozLatencyBucket;

	const signozMetricsServiceName = WidgetKeys.OTelServiceName;
	const newAutoCompleteData: BaseAutocompleteData = {
		key: isSpanMetricEnable
			? signozLatencyBucketMetrics
			: WidgetKeys.DurationNano,
		dataType: DataTypes.Float64,
		type: isSpanMetricEnable ? '' : MetricsType.Tag,
	};

	const autocompleteData = Array(3).fill(newAutoCompleteData);

	const filterItem: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: isSpanMetricEnable ? signozMetricsServiceName : WidgetKeys.ServiceName,
				dataType: DataTypes.String,
				type: isSpanMetricEnable ? MetricsType.Resource : MetricsType.Tag,
			},
			op: isSpanMetricEnable ? OPERATORS.IN : OPERATORS['='],
			value: isSpanMetricEnable ? [servicename] : servicename,
		},
		{
			id: '',
			key: {
				dataType: DataTypes.String,
				key: isSpanMetricEnable ? WidgetKeys.Operation : WidgetKeys.Name,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN.toLowerCase(), // TODO: need to remove toLowerCase() this once backend is changed
			value: [...topLevelOperationsRoute],
		},
		...tagFilterItems,
	];

	const filterItems = Array(3).fill([...filterItem]);
	const legends = LATENCY_AGGREGATEOPERATOR;
	const aggregateOperator = isSpanMetricEnable
		? LATENCY_AGGREGATEOPERATOR_SPAN_METRICS
		: LATENCY_AGGREGATEOPERATOR;
	const dataSource = isSpanMetricEnable ? DataSource.METRICS : DataSource.TRACES;
	const queryNameAndExpression = QUERYNAME_AND_EXPRESSION;

	const timeAggregateOperators = [
		MetricAggregateOperator.EMPTY,
		MetricAggregateOperator.EMPTY,
		MetricAggregateOperator.EMPTY,
	];
	const spaceAggregateOperators = [
		MetricAggregateOperator.P50,
		MetricAggregateOperator.P90,
		MetricAggregateOperator.P99,
	];

	return getQueryBuilderQueries({
		autocompleteData,
		legends,
		filterItems,
		aggregateOperator,
		dataSource,
		queryNameAndExpression,
		timeAggregateOperators,
		spaceAggregateOperators,
	});
};

export const apDexTracesQueryBuilderQueries = ({
	servicename,
	tagFilterItems,
	topLevelOperationsRoute,
	threashold,
}: ApDexProps): QueryBuilderData => {
	const autoCompleteDataA: BaseAutocompleteData = {
		dataType: DataTypes.Float64,
		key: '',
		type: '',
	};

	const autoCompleteDataB: BaseAutocompleteData = {
		dataType: DataTypes.Float64,
		key: '',
		type: '',
	};

	const autoCompleteDataC: BaseAutocompleteData = {
		dataType: DataTypes.Float64,
		key: '',
		type: '',
	};

	const filterItemA: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: WidgetKeys.ServiceName,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: servicename,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Name,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: [...topLevelOperationsRoute],
		},
		...tagFilterItems,
	];

	const filterItemB: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: WidgetKeys.HasError,
				dataType: DataTypes.bool,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: false,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.DurationNano,
				dataType: DataTypes.Float64,
				type: MetricsType.Tag,
			},
			op: OPERATORS['<='],
			value: convertMilSecToNanoSec(threashold),
		},
		{
			id: '',
			key: {
				key: WidgetKeys.ServiceName,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: servicename,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Name,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: [...topLevelOperationsRoute],
		},
		...tagFilterItems,
	];

	const filterItemC: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: WidgetKeys.DurationNano,
				dataType: DataTypes.Float64,
				type: MetricsType.Tag,
			},
			op: OPERATORS['<='],
			value: convertMilSecToNanoSec(threashold * 4),
		},
		{
			id: '',
			key: {
				key: WidgetKeys.HasError,
				dataType: DataTypes.bool,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: false,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.ServiceName,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: servicename,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Name,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: [...topLevelOperationsRoute],
		},
		...tagFilterItems,
	];

	const autocompleteData = [
		autoCompleteDataA,
		autoCompleteDataB,
		autoCompleteDataC,
	];
	const additionalItems = [filterItemA, filterItemB, filterItemC];
	const legends = [GraphTitle.APDEX];
	const disabled = Array(3).fill(true);
	const expressions = [FORMULA.APDEX_TRACES];
	const legendFormulas = [GraphTitle.APDEX];
	const timeAggregateOperators = [
		MetricAggregateOperator.COUNT,
		MetricAggregateOperator.COUNT,
		MetricAggregateOperator.COUNT,
	];
	const spaceAggregateOperators = [
		MetricAggregateOperator.EMPTY,
		MetricAggregateOperator.EMPTY,
		MetricAggregateOperator.EMPTY,
	];
	const dataSource = DataSource.TRACES;

	return getQueryBuilderQuerieswithFormula({
		autocompleteData,
		additionalItems,
		legends,
		disabled,
		expressions,
		legendFormulas,
		timeAggregateOperators,
		spaceAggregateOperators,
		dataSource,
	});
};

export const apDexMetricsQueryBuilderQueries = ({
	servicename,
	tagFilterItems,
	topLevelOperationsRoute,
	threashold,
	delta,
	metricsBuckets,
}: ApDexMetricsQueryBuilderQueriesProps): QueryBuilderData => {
	const autoCompleteDataA: BaseAutocompleteData = {
		key: WidgetKeys.SignozLatencyCount,
		dataType: DataTypes.Float64,
		type: '',
	};

	const autoCompleteDataB: BaseAutocompleteData = {
		key: WidgetKeys.SignozLatencyBucket,
		dataType: DataTypes.Float64,
		type: '',
	};

	const autoCompleteDataC: BaseAutocompleteData = {
		key: WidgetKeys.SignozLatencyBucket,
		dataType: DataTypes.Float64,
		type: '',
	};

	const filterItemA: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: WidgetKeys.OTelServiceName,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: servicename,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Operation,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: [...topLevelOperationsRoute],
		},
		...tagFilterItems,
	];

	const filterItemB: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: WidgetKeys.StatusCode,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['!='],
			value: 'STATUS_CODE_ERROR',
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Le,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: getNearestHighestBucketValue(threashold * 1000, metricsBuckets),
		},
		{
			id: '',
			key: {
				key: WidgetKeys.OTelServiceName,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: servicename,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Operation,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: [...topLevelOperationsRoute],
		},
		...tagFilterItems,
	];

	const filterItemC: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: WidgetKeys.Le,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: getNearestHighestBucketValue(threashold * 1000 * 4, metricsBuckets),
		},
		{
			id: '',
			key: {
				key: WidgetKeys.StatusCode,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['!='],
			value: 'STATUS_CODE_ERROR',
		},
		{
			id: '',
			key: {
				key: WidgetKeys.OTelServiceName,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS['='],
			value: servicename,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Operation,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: [...topLevelOperationsRoute],
		},
		...tagFilterItems,
	];

	const autocompleteData = [
		autoCompleteDataA,
		autoCompleteDataB,
		autoCompleteDataC,
	];

	const additionalItems = [filterItemA, filterItemB, filterItemC];
	const legends = [GraphTitle.APDEX];
	const disabled = Array(3).fill(true);
	const expressions = delta
		? [FORMULA.APDEX_DELTA_SPAN_METRICS]
		: [FORMULA.APDEX_CUMULATIVE_SPAN_METRICS];
	const legendFormulas = [GraphTitle.APDEX];
	const timeAggregateOperators = [
		MetricAggregateOperator.RATE,
		MetricAggregateOperator.RATE,
		MetricAggregateOperator.RATE,
	];

	const spaceAggregateOperators = [
		MetricAggregateOperator.SUM,
		MetricAggregateOperator.SUM,
		MetricAggregateOperator.SUM,
	];
	const dataSource = DataSource.METRICS;

	return getQueryBuilderQuerieswithFormula({
		autocompleteData,
		additionalItems,
		legends,
		disabled,
		expressions,
		legendFormulas,
		timeAggregateOperators,
		spaceAggregateOperators,
		dataSource,
	});
};

/** The service's top-level spans, as trace filters. */
const topLevelSpanFilters = ({
	servicename,
	tagFilterItems,
	topLevelOperations,
}: OperationPerSecProps): TagFilterItem[] => [
	{
		id: '',
		key: {
			key: WidgetKeys.ServiceName,
			dataType: DataTypes.String,
			type: MetricsType.Tag,
		},
		op: OPERATORS['='],
		value: servicename,
	},
	{
		id: '',
		key: {
			key: WidgetKeys.Name,
			dataType: DataTypes.String,
			type: MetricsType.Tag,
		},
		op: OPERATORS.IN,
		value: topLevelOperations,
	},
	...tagFilterItems,
];

const hasErrorFilter: TagFilterItem = {
	id: '',
	key: {
		key: WidgetKeys.HasError,
		dataType: DataTypes.bool,
		type: MetricsType.Tag,
	},
	op: OPERATORS['='],
	value: true,
};

const operationPerSecTraces = (props: OperationPerSecProps): QueryBuilderData =>
	getQueryBuilderQueries({
		autocompleteData: [{ key: '', dataType: DataTypes.EMPTY, type: '' }],
		legends: OPERATION_LEGENDS,
		filterItems: [topLevelSpanFilters(props)],
		aggregateOperator: [TracesAggregatorOperator.RATE],
		dataSource: DataSource.TRACES,
		timeAggregateOperators: [MetricAggregateOperator.RATE],
		spaceAggregateOperators: [MetricAggregateOperator.EMPTY],
	});

const errorPercentageTraces = (
	props: OperationPerSecProps,
): QueryBuilderData => {
	const spans = topLevelSpanFilters(props);
	const [service, operations, ...resourceFilters] = spans;
	return getQueryBuilderQuerieswithFormula({
		autocompleteData: [
			{ key: '', dataType: DataTypes.EMPTY, type: '' },
			{ key: '', dataType: DataTypes.EMPTY, type: '' },
		],
		additionalItems: [
			[service, operations, hasErrorFilter, ...resourceFilters],
			spans,
		],
		legends: [GraphTitle.ERROR_PERCENTAGE],
		disabled: [true, true],
		expressions: [FORMULA.ERROR_PERCENTAGE],
		legendFormulas: [GraphTitle.ERROR_PERCENTAGE],
		timeAggregateOperators: [
			MetricAggregateOperator.COUNT,
			MetricAggregateOperator.COUNT,
		],
		spaceAggregateOperators: [
			MetricAggregateOperator.EMPTY,
			MetricAggregateOperator.EMPTY,
		],
		dataSource: DataSource.TRACES,
	});
};

export const operationPerSec = (
	props: OperationPerSecProps,
): QueryBuilderData => {
	if (!props.isSpanMetricEnable) {
		return operationPerSecTraces(props);
	}
	const { servicename, tagFilterItems, topLevelOperations } = props;
	const autocompleteData: BaseAutocompleteData[] = [
		{
			key: WidgetKeys.SignozLatencyCount,
			dataType: DataTypes.Float64,
			type: '',
		},
	];

	const filterItems: TagFilterItem[][] = [
		[
			{
				id: '',
				key: {
					key: WidgetKeys.OTelServiceName,
					dataType: DataTypes.String,
					type: MetricsType.Resource,
				},
				op: OPERATORS.IN,
				value: [`${servicename}`],
			},
			{
				id: '',
				key: {
					key: WidgetKeys.Operation,
					dataType: DataTypes.String,
					type: MetricsType.Tag,
				},
				op: OPERATORS.IN,
				value: topLevelOperations,
			},
			...tagFilterItems,
		],
	];

	const legends = OPERATION_LEGENDS;
	const dataSource = DataSource.METRICS;

	const timeAggregateOperators = [MetricAggregateOperator.RATE];
	const spaceAggregateOperators = [MetricAggregateOperator.SUM];

	return getQueryBuilderQueries({
		autocompleteData,
		legends,
		filterItems,
		dataSource,
		timeAggregateOperators,
		spaceAggregateOperators,
	});
};

export const errorPercentage = (
	props: OperationPerSecProps,
): QueryBuilderData => {
	if (!props.isSpanMetricEnable) {
		return errorPercentageTraces(props);
	}
	const { servicename, tagFilterItems, topLevelOperations } = props;
	const autocompleteDataA: BaseAutocompleteData = {
		key: WidgetKeys.SignozCallsTotal,
		dataType: DataTypes.Float64,
		type: '',
	};
	const autocompleteDataB: BaseAutocompleteData = {
		key: WidgetKeys.SignozCallsTotal,
		dataType: DataTypes.Float64,
		type: '',
	};

	const autocompleteData = [autocompleteDataA, autocompleteDataB];

	const additionalItemsA: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: WidgetKeys.OTelServiceName,
				dataType: DataTypes.String,
				type: MetricsType.Resource,
			},
			op: OPERATORS.IN,
			value: [`${servicename}`],
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Operation,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: topLevelOperations,
		},
		{
			id: '',
			key: {
				key: WidgetKeys.StatusCode,
				dataType: DataTypes.Int64,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: ['STATUS_CODE_ERROR'],
		},
		...tagFilterItems,
	];

	const additionalItemsB: TagFilterItem[] = [
		{
			id: '',
			key: {
				key: WidgetKeys.OTelServiceName,
				dataType: DataTypes.String,
				type: MetricsType.Resource,
			},
			op: OPERATORS.IN,
			value: [`${servicename}`],
		},
		{
			id: '',
			key: {
				key: WidgetKeys.Operation,
				dataType: DataTypes.String,
				type: MetricsType.Tag,
			},
			op: OPERATORS.IN,
			value: topLevelOperations,
		},
		...tagFilterItems,
	];

	const additionalItems = [additionalItemsA, additionalItemsB];
	const legends = [GraphTitle.ERROR_PERCENTAGE];
	const disabled = [true, true];
	const expressions = [FORMULA.ERROR_PERCENTAGE];
	const legendFormulas = [GraphTitle.ERROR_PERCENTAGE];
	const timeAggregateOperators = [
		MetricAggregateOperator.RATE,
		MetricAggregateOperator.RATE,
	];
	const spaceAggregateOperators = [
		MetricAggregateOperator.SUM,
		MetricAggregateOperator.SUM,
	];
	const dataSource = DataSource.METRICS;

	return getQueryBuilderQuerieswithFormula({
		autocompleteData,
		additionalItems,
		legends,
		disabled,
		expressions,
		legendFormulas,
		timeAggregateOperators,
		spaceAggregateOperators,
		dataSource,
	});
};
