import { PANEL_TYPES } from 'constants/queryBuilder';
import {
	GraphTitle,
	SERVICE_CHART_ID,
} from 'container/MetricsApplication/constant';
import { getWidgetQueryBuilder } from 'container/MetricsApplication/MetricsApplication.factory';
import { Widgets } from 'types/api/widgets/widget';
import { EQueryType } from 'types/common/dashboard';
import { QueryBuilderData } from 'types/common/queryBuilder';
import { v4 as uuid } from 'uuid';

/** The Apdex chart's widget: a score, so a fixed 0–1 axis. */
export function apdexWidget(builder: QueryBuilderData): Widgets {
	return {
		...getWidgetQueryBuilder({
			query: {
				queryType: EQueryType.QUERY_BUILDER,
				promql: [],
				builder,
				clickhouse_sql: [],
				id: uuid(),
			},
			title: GraphTitle.APDEX,
			panelTypes: PANEL_TYPES.TIME_SERIES,
			id: SERVICE_CHART_ID.apdex,
		}),
		softMin: 0,
		softMax: 1,
		decimalPrecision: 2,
	};
}
