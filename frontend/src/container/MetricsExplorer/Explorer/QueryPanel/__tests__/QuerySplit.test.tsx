import { QueryClient, QueryClientProvider } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { initialQueriesMap } from 'constants/queryBuilder';
import * as useQueryBuilderHooks from 'hooks/queryBuilder/useQueryBuilder';
import store from 'store';
import {
	IBuilderFormula,
	IBuilderQuery,
	Query,
} from 'types/api/queryBuilder/queryBuilderData';
import { DataSource, QueryBuilderContextType } from 'types/common/queryBuilder';

import QuerySplit from '../QuerySplit';
import { PANEL_LAYOUT_KEY } from '../usePanelLayout';

jest.mock('hooks/useDimensions', () => ({
	useResizeObserver: (): { width: number; height: number } => ({
		width: 800,
		height: 400,
	}),
}));

const base = initialQueriesMap[DataSource.METRICS];

function metricQuery(name: string, filter = ''): IBuilderQuery {
	return {
		...base.builder.queryData[0],
		queryName: name,
		expression: name,
		aggregateAttribute: {
			...base.builder.queryData[0].aggregateAttribute,
			key: 'signoz_calls_total',
			type: 'Sum',
		},
		timeAggregation: 'rate',
		spaceAggregation: 'sum',
		stepInterval: 60,
		filter: { expression: filter },
	} as IBuilderQuery;
}

const formula: IBuilderFormula = {
	queryName: 'F1',
	expression: 'B / A * 100',
	disabled: false,
	legend: '',
};

function boardQuery(extra: IBuilderQuery[] = []): Query {
	return {
		...base,
		builder: {
			...base.builder,
			queryData: [
				metricQuery('A'),
				metricQuery('B', "status.code = 'STATUS_CODE_ERROR'"),
				...extra,
			],
			queryFormulas: [formula],
		},
	};
}

const setters = {
	handleSetQueryData: jest.fn(),
	handleSetFormulaData: jest.fn(),
	redirectWithQueryBuilderData: jest.fn(),
	handleRunQuery: jest.fn(),
	removeQueryBuilderEntityByIndex: jest.fn(),
	handleSetConfig: jest.fn(),
	addNewBuilderQuery: jest.fn(),
	addNewFormula: jest.fn(),
	cloneQuery: jest.fn(),
	removeQueryTypeItemByIndex: jest.fn(),
	handleSetQueryItemData: jest.fn(),
	updateAllQueriesOperators: jest.fn(),
};

function mockBuilder(query: Query): void {
	jest.spyOn(useQueryBuilderHooks, 'useQueryBuilder').mockReturnValue({
		...setters,
		currentQuery: query,
		stagedQuery: query,
		panelType: 'graph',
		initialDataSource: DataSource.METRICS,
		isDefaultQuery: jest.fn(),
		isStagedQueryUpdated: jest.fn(),
	} as unknown as QueryBuilderContextType);
}

const queryClient = new QueryClient();
const onRun = jest.fn();

function ui(
	lastRun: { finishedAt: Date; durationMs: number } | null = null,
): JSX.Element {
	return (
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<Provider store={store}>
					<QuerySplit
						metricSelectAddon={(): null => null}
						isLoadingQueries={false}
						lastRun={lastRun}
						onRun={onRun}
						onCancel={jest.fn()}
					>
						<div data-testid="results-slot" />
					</QuerySplit>
				</Provider>
			</MemoryRouter>
		</QueryClientProvider>
	);
}

const isOpen = (name: string): boolean =>
	screen
		.getByTestId(`query-card-toggle-${name}`)
		.getAttribute('aria-expanded') === 'true';

describe('QuerySplit', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.clear();
		mockBuilder(boardQuery());
	});

	it('shows the queries beside the results with their count', () => {
		render(ui());

		expect(screen.getByTestId('query-panel')).toBeInTheDocument();
		expect(screen.getByTestId('results-slot')).toBeInTheDocument();
		expect(screen.getByTestId('query-panel-count')).toHaveTextContent(
			'2 queries · 1 formula',
		);
	});

	it('opens every card, with the filter editor inline, and collapses one to its summary', () => {
		render(ui());

		expect(isOpen('A') && isOpen('B') && isOpen('F1')).toBe(true);
		expect(
			within(screen.getByTestId('query-where-B')).getAllByText(
				/STATUS_CODE_ERROR/,
			)[0],
		).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('query-card-toggle-B'));
		expect(isOpen('B')).toBe(false);
		expect(screen.getByTestId('query-card-B')).toHaveTextContent(
			"rate · 60s · sum · where status.code = 'STATUS_CODE_ERROR'",
		);

		fireEvent.click(screen.getByTestId('query-card-done-A'));
		expect(isOpen('A')).toBe(false);
	});

	it('collapses to a rail of letters, remembered, and a letter opens just that query', () => {
		const { unmount } = render(ui());
		fireEvent.click(screen.getByRole('button', { name: 'Collapse query panel' }));

		expect(screen.queryByTestId('query-panel')).not.toBeInTheDocument();
		expect(screen.getByTestId('query-rail')).toBeInTheDocument();
		unmount();

		render(ui());
		expect(screen.getByTestId('query-rail')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Open B' }));

		expect(screen.getByTestId('query-panel')).toBeInTheDocument();
		expect(isOpen('B')).toBe(true);
		expect(isOpen('A')).toBe(false);
		expect(isOpen('F1')).toBe(false);
	});

	it('keeps the width the panel was resized to', () => {
		localStorage.setItem(
			PANEL_LAYOUT_KEY,
			JSON.stringify({ collapsed: false, widthPercent: 60 }),
		);
		render(ui());

		expect(screen.getByTestId('query-panel')).toHaveStyle({ flexBasis: '60%' });
		fireEvent.doubleClick(screen.getByTestId('query-panel-grip'));
		expect(screen.getByTestId('query-panel')).toHaveStyle({ flexBasis: '50%' });
	});

	it('runs the query from the panel footer and shows the last run once there is one', () => {
		const { rerender } = render(ui());

		expect(screen.queryByTestId('query-panel-last-run')).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: /Run Query/ }));
		expect(onRun).toHaveBeenCalledTimes(1);

		rerender(
			ui({ finishedAt: new Date(2026, 9, 20, 14, 30, 2), durationMs: 412 }),
		);
		expect(screen.getByTestId('query-panel-last-run')).toHaveTextContent(
			'Last run 14:30:02 · 412 ms',
		);
	});

	it('adds queries and formulas with the builder handlers', () => {
		render(ui());

		fireEvent.click(screen.getByRole('button', { name: 'Add query' }));
		fireEvent.click(screen.getByRole('button', { name: 'Add formula' }));

		expect(setters.addNewBuilderQuery).toHaveBeenCalledTimes(1);
		expect(setters.addNewFormula).toHaveBeenCalledTimes(1);
	});

	it('Reset puts back a query and a formula as they were when opened', () => {
		const { rerender } = render(ui());
		const edited = boardQuery();
		edited.builder.queryData[0] = {
			...edited.builder.queryData[0],
			spaceAggregation: 'max',
		};
		mockBuilder(edited);
		rerender(ui());

		fireEvent.click(screen.getByTestId('query-card-reset-A'));
		fireEvent.click(screen.getByTestId('query-card-reset-F1'));

		expect(setters.handleSetQueryData).toHaveBeenCalledWith(
			0,
			boardQuery().builder.queryData[0],
		);
		expect(setters.handleSetFormulaData).toHaveBeenCalledWith(0, formula);
	});

	it('leaves the query state and payload untouched while browsing', () => {
		const query = boardQuery();
		const before = JSON.stringify(query);
		mockBuilder(query);
		render(ui());

		fireEvent.click(screen.getByTestId('query-card-toggle-A'));
		fireEvent.click(screen.getByTestId('query-card-toggle-A'));
		fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
		fireEvent.click(screen.getByRole('button', { name: 'Collapse query panel' }));
		fireEvent.click(screen.getByRole('button', { name: 'Open F1' }));

		expect(JSON.stringify(query)).toBe(before);
		expect(setters.handleSetQueryData).not.toHaveBeenCalled();
		expect(setters.handleSetFormulaData).not.toHaveBeenCalled();
		expect(setters.redirectWithQueryBuilderData).not.toHaveBeenCalled();
		expect(setters.handleRunQuery).not.toHaveBeenCalled();
		expect(setters.removeQueryBuilderEntityByIndex).not.toHaveBeenCalled();
	});

	it("edits a query's functions with the builder's function editor", () => {
		render(ui());

		const functions = screen.getByTestId('query-functions-A');
		expect(functions).toHaveTextContent('Functions');
		fireEvent.click(
			functions.querySelector('.add-function-btn') as HTMLButtonElement,
		);

		expect(setters.handleSetQueryData).toHaveBeenCalledWith(
			0,
			expect.objectContaining({
				queryName: 'A',
				functions: [expect.objectContaining({ args: [] })],
			}),
		);
	});
});
