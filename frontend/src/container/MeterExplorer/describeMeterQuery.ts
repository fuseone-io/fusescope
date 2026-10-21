import { mapQueryDataFromApi } from 'lib/newQueryBuilder/queryBuilderMappers/mapQueryDataFromApi';
import { ICompositeMetricQuery } from 'types/api/alerts/compositeQuery';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';

function describe(query: IBuilderQuery): string {
	const metric = query.aggregateAttribute?.key;
	if (!metric) {
		return '';
	}
	const time = query.timeAggregation || 'increase';
	const space = query.spaceAggregation || 'sum';
	const filter = query.filter?.expression?.trim();
	const groupBy = (query.groupBy ?? []).map((key) => key.key).filter(Boolean);
	return [
		`${space}(${time}(${metric}))`,
		filter ? `where ${filter}` : '',
		groupBy.length ? `by ${groupBy.join(', ')}` : '',
	]
		.filter(Boolean)
		.join(' ');
}

/** The enabled meter queries in one line. */
export function describeMeterQueryData(queryData: IBuilderQuery[]): string {
	return queryData
		.filter((query) => !query.disabled)
		.map(describe)
		.filter(Boolean)
		.join('; ');
}

/** A saved meter view's query in one line, e.g. `sum(increase(signoz.meter.log.size)) by service.name`. */
export function describeMeterQuery(
	compositeQuery: ICompositeMetricQuery,
): string {
	if (!compositeQuery?.builderQueries && !compositeQuery?.queries) {
		return '';
	}
	return describeMeterQueryData(
		mapQueryDataFromApi(compositeQuery).builder.queryData,
	);
}
