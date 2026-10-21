import { fireEvent, render, screen } from '@testing-library/react';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { requireQueryPanelDefinition } from 'pages/DashboardPage/DashboardContainer/Panels/capabilities';
import type { PanelKind } from 'pages/DashboardPage/DashboardContainer/Panels/types/panelKind';
import { EQueryType } from 'types/common/dashboard';

import {
	type PanelEditorChrome,
	PanelEditorChromeProvider,
} from '../../PanelEditorLayout/PanelEditorChromeContext';
import PanelEditorQueryBuilder from '../PanelEditorQueryBuilder';

const mockQueryBuilderV2 = jest.fn();

jest.mock('hooks/queryBuilder/useQueryBuilder', () => ({
	useQueryBuilder: jest.fn(),
}));
jest.mock('hooks/useDarkMode', () => ({ useIsDarkMode: (): boolean => false }));
jest.mock('components/QueryBuilderV2/useSyncQueryBuilderFields', () => ({
	useSyncQueryBuilderFields: jest.fn(),
}));
jest.mock('components/QueryBuilderV2/QueryBuilderV2', () => ({
	QueryBuilderV2: (props: unknown): null => {
		mockQueryBuilderV2(props);
		return null;
	},
}));
jest.mock('container/QueryBuilder/rawQueryEditors/ClickHouse', () => ({
	__esModule: true,
	default: (): JSX.Element => <div data-testid="clickhouse-editor" />,
}));
jest.mock('container/QueryBuilder/rawQueryEditors/PromQL', () => ({
	__esModule: true,
	default: (): JSX.Element => <div data-testid="promql-editor" />,
}));
jest.mock('container/QueryBuilder/components/RunQueryBtn/RunQueryBtn', () => ({
	__esModule: true,
	default: ({
		onStageRunQuery,
	}: {
		onStageRunQuery: () => void;
	}): JSX.Element => (
		<button type="button" onClick={onStageRunQuery}>
			Run Query
		</button>
	),
}));
jest.mock('components/TextToolTip', () => ({
	__esModule: true,
	default: (): null => null,
}));
jest.mock('assets/Dashboard/PromQl', () => ({
	__esModule: true,
	default: (): null => null,
}));

const mockUseQueryBuilder = useQueryBuilder as unknown as jest.Mock;

function query(queryType: EQueryType): unknown {
	return {
		queryType,
		builder: {
			queryData: [{ queryName: 'A', dataSource: 'metrics' }],
			queryFormulas: [],
		},
		clickhouse_sql: [{ name: 'A', query: '' }],
		promql: [{ name: 'A', query: '' }],
	};
}

const chrome: PanelEditorChrome = {
	collapseQueryPanel: jest.fn(),
	settingsCollapsed: false,
	setSettingsCollapsed: jest.fn(),
	openQuery: undefined,
	setOpenQuery: jest.fn(),
};

function renderPanel(
	panelKind: PanelKind,
	props: Partial<React.ComponentProps<typeof PanelEditorQueryBuilder>> = {},
): { onChangeQueryMode: jest.Mock; onStageRunQuery: jest.Mock } {
	const onChangeQueryMode = jest.fn();
	const onStageRunQuery = jest.fn();
	render(
		<PanelEditorChromeProvider value={chrome}>
			<PanelEditorQueryBuilder
				panelDefinition={requireQueryPanelDefinition(panelKind)}
				onChangeQueryMode={onChangeQueryMode}
				isLoadingQueries={false}
				onStageRunQuery={onStageRunQuery}
				onCancelQuery={jest.fn()}
				{...props}
			/>
		</PanelEditorChromeProvider>,
	);
	return { onChangeQueryMode, onStageRunQuery };
}

describe('PanelEditorQueryBuilder inside the editor frame', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUseQueryBuilder.mockReturnValue({
			currentQuery: query(EQueryType.QUERY_BUILDER),
		});
	});

	it.each<[PanelKind, string[]]>([
		[
			'signoz/TimeSeriesPanel',
			['Query Builder', 'ClickHouse Query', 'PromQL', 'AI Query Builder'],
		],
		[
			'signoz/TablePanel',
			['Query Builder', 'ClickHouse Query', 'AI Query Builder'],
		],
		['signoz/ListPanel', ['Query Builder', 'AI Query Builder']],
	])('offers the query types %s supports', (kind, expected) => {
		renderPanel(kind);

		const group = screen.getByRole('group', { name: 'Query type' });
		expect(
			Array.from(group.querySelectorAll('button')).map((button) =>
				button.getAttribute('aria-label'),
			),
		).toStrictEqual(expected);
		expect(screen.getByRole('button', { name: 'Query Builder' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});

	it('switches query type through the host', () => {
		const { onChangeQueryMode } = renderPanel('signoz/TimeSeriesPanel');

		fireEvent.click(screen.getByRole('button', { name: 'PromQL' }));

		expect(onChangeQueryMode).toHaveBeenCalledWith(EQueryType.PROM);
	});

	it('hands the builder the same configuration as the tabbed editor', () => {
		renderPanel('signoz/ListPanel');

		const props = mockQueryBuilderV2.mock.calls[0][0];
		expect(props).toStrictEqual(
			expect.objectContaining({
				panelType: 'list',
				isRawQuery: true,
				showTraceOperator: false,
				allowedDataSources: ['logs', 'traces'],
				version: 'v3',
				signalSourceChangeEnabled: true,
				savePreviousQuery: true,
			}),
		);
	});

	it('shows the raw editor of the active query type', () => {
		mockUseQueryBuilder.mockReturnValue({
			currentQuery: query(EQueryType.CLICKHOUSE),
		});
		renderPanel('signoz/TimeSeriesPanel');

		expect(screen.getByTestId('clickhouse-editor')).toBeInTheDocument();
		expect(mockQueryBuilderV2).not.toHaveBeenCalled();
	});

	it('keeps a kind’s own editor (List columns) in the panel', () => {
		renderPanel('signoz/ListPanel', {
			footer: <div data-testid="list-columns" />,
		});

		expect(screen.getByTestId('list-columns')).toBeInTheDocument();
	});

	it('runs on ⌘↵ and from the footer, and collapses to the rail', () => {
		const { onStageRunQuery } = renderPanel('signoz/TimeSeriesPanel');

		fireEvent.keyDown(screen.getByTestId('panel-editor-query-panel'), {
			key: 'Enter',
			metaKey: true,
		});
		fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));
		expect(onStageRunQuery).toHaveBeenCalledTimes(2);

		fireEvent.click(screen.getByTestId('panel-editor-collapse-queries'));
		expect(chrome.collapseQueryPanel).toHaveBeenCalled();
	});
});
