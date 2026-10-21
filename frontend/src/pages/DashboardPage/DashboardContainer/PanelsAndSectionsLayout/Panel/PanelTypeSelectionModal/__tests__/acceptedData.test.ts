import { TelemetrytypesSignalDTO } from 'api/generated/services/fuseScope.schemas';
import { QueryModeKind } from 'pages/DashboardPage/DashboardContainer/Panels/types/panelCapabilities';
import type { PanelKind } from 'pages/DashboardPage/DashboardContainer/Panels/types/panelKind';
import { QueryMode } from 'types/api/queryBuilder/queryBuilderData';

import { acceptedData, describeAcceptedData } from '../acceptedData';

const { metrics, logs, traces } = TelemetrytypesSignalDTO;
const SIGNAL_LESS = { kind: QueryModeKind.SIGNAL_LESS } as const;

describe('describeAcceptedData', () => {
	it.each([
		[
			'every signal and both raw languages',
			{
				[QueryMode.QUERY_BUILDER]: {
					kind: QueryModeKind.SIGNAL,
					signals: [metrics, logs, traces],
				},
				[QueryMode.CLICKHOUSE]: SIGNAL_LESS,
				[QueryMode.PROM]: SIGNAL_LESS,
			},
			['Metrics, logs & traces', 'PromQL', 'ClickHouse'],
		],
		[
			'every signal without PromQL',
			{
				[QueryMode.QUERY_BUILDER]: {
					kind: QueryModeKind.SIGNAL,
					signals: [metrics, logs, traces],
				},
				[QueryMode.CLICKHOUSE]: SIGNAL_LESS,
			},
			['Metrics, logs & traces', 'ClickHouse', 'No PromQL'],
		],
		[
			'metrics only',
			{
				[QueryMode.QUERY_BUILDER]: {
					kind: QueryModeKind.SIGNAL,
					signals: [metrics],
				},
				[QueryMode.CLICKHOUSE]: SIGNAL_LESS,
				[QueryMode.PROM]: SIGNAL_LESS,
			},
			['Metrics only', 'PromQL', 'ClickHouse'],
		],
		[
			'logs and traces from the builder and the AI builder',
			{
				[QueryMode.QUERY_BUILDER]: {
					kind: QueryModeKind.SIGNAL,
					signals: [logs, traces],
				},
				[QueryMode.AI_QUERY_BUILDER]: {
					kind: QueryModeKind.SIGNAL,
					signals: [traces],
				},
			},
			['Logs & traces'],
		],
		[
			'traces only',
			{
				[QueryMode.QUERY_BUILDER]: {
					kind: QueryModeKind.SIGNAL,
					signals: [traces],
				},
			},
			['Traces only'],
		],
		['no query modes', undefined, ['No query']],
	])('%s', (_name, modes, expected) => {
		expect(describeAcceptedData(modes)).toStrictEqual(expected);
	});
});

describe('acceptedData', () => {
	it.each<[PanelKind, string[]]>([
		[
			'signoz/TimeSeriesPanel',
			['Metrics, logs & traces', 'PromQL', 'ClickHouse'],
		],
		[
			'signoz/PieChartPanel',
			['Metrics, logs & traces', 'ClickHouse', 'No PromQL'],
		],
		['signoz/HeatmapPanel', ['Metrics only', 'PromQL', 'ClickHouse']],
		['signoz/ListPanel', ['Logs & traces']],
		['signoz/TextPanel', ['No query']],
	])('%s', (kind, expected) => {
		expect(acceptedData(kind)).toStrictEqual(expected);
	});
});
