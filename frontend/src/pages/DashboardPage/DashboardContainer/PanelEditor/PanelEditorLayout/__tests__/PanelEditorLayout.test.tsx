import { fireEvent, render, screen } from '@testing-library/react';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { EQueryType } from 'types/common/dashboard';

import PanelEditorLayout from '../PanelEditorLayout';
import { usePanelEditorChrome } from '../PanelEditorChromeContext';
import { PANEL_EDITOR_LAYOUT_KEY } from '../usePanelEditorLayout';

jest.mock('hooks/queryBuilder/useQueryBuilder', () => ({
	useQueryBuilder: jest.fn(),
}));

(useQueryBuilder as unknown as jest.Mock).mockReturnValue({
	currentQuery: {
		queryType: EQueryType.QUERY_BUILDER,
		builder: {
			queryData: [{ queryName: 'A' }, { queryName: 'B' }],
			queryFormulas: [{ queryName: 'F1' }],
		},
		clickhouse_sql: [],
		promql: [],
	},
});

function Editor(): JSX.Element {
	const chrome = usePanelEditorChrome();
	return (
		<div data-testid="editor">
			open: {String(chrome?.openQuery)}
			<button type="button" onClick={chrome?.collapseQueryPanel}>
				collapse queries
			</button>
		</div>
	);
}

function Settings(): JSX.Element {
	const chrome = usePanelEditorChrome();
	return (
		<button
			type="button"
			onClick={(): void => chrome?.setSettingsCollapsed(!chrome.settingsCollapsed)}
		>
			{chrome?.settingsCollapsed ? 'settings rail' : 'settings pane'}
		</button>
	);
}

function renderLayout(onRun = jest.fn()): void {
	render(
		<PanelEditorLayout
			header={<div>header</div>}
			preview={<div>preview</div>}
			editor={<Editor />}
			config={<Settings />}
			mode={{ type: 'query', onRun }}
		/>,
	);
}

describe('PanelEditorLayout', () => {
	beforeEach(() => localStorage.clear());

	it('collapses the queries to a rail of letters that reopens on one', () => {
		renderLayout();

		fireEvent.click(screen.getByText('collapse queries'));
		const rail = screen.getByTestId('panel-editor-query-rail');
		expect(
			Array.from(rail.querySelectorAll('.qa')).map((el) => el.textContent),
		).toStrictEqual(['A', 'B', 'F1']);

		fireEvent.click(screen.getByRole('button', { name: 'Open B' }));

		expect(screen.getByTestId('editor')).toHaveTextContent('open: B');
		expect(
			screen.queryByTestId('panel-editor-query-rail'),
		).not.toBeInTheDocument();
	});

	it('runs the query from the rail', () => {
		const onRun = jest.fn();
		renderLayout(onRun);

		fireEvent.click(screen.getByText('collapse queries'));
		fireEvent.click(screen.getByRole('button', { name: 'Run query' }));

		expect(onRun).toHaveBeenCalled();
	});

	it('remembers collapsed panes across visits', () => {
		renderLayout();
		fireEvent.click(screen.getByText('collapse queries'));
		fireEvent.click(screen.getByText('settings pane'));

		expect(
			JSON.parse(localStorage.getItem(PANEL_EDITOR_LAYOUT_KEY) ?? '{}'),
		).toStrictEqual(
			expect.objectContaining({ queryCollapsed: true, settingsCollapsed: true }),
		);
		expect(screen.getByText('settings rail')).toBeInTheDocument();
	});
});
