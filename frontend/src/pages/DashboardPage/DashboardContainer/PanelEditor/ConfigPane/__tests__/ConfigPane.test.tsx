import { useState } from 'react';
import type {
	DashboardtypesPanelDTO,
	DashboardtypesPanelSpecDTO,
} from 'api/generated/services/fuseScope.schemas';
import { render, screen, userEvent } from 'tests/test-utils';
import { EQueryType } from 'types/common/dashboard';

import {
	type PanelEditorChrome,
	PanelEditorChromeProvider,
} from '../../PanelEditorLayout/PanelEditorChromeContext';
import ConfigPane from '../ConfigPane';

// ConfigActions seeds alerts from the panel, which reads the loaded dashboard for
// analytics context — always present under the real editor route.
jest.mock(
	'pages/DashboardPage/DashboardContainer/hooks/useDashboardEventMeta',
	() => ({
		useDashboardEventMeta: (): {
			dashboardId: string;
			dashboardName: string;
		} => ({
			dashboardId: 'dash-1',
			dashboardName: 'Infra overview',
		}),
	}),
);

jest.mock(
	'pages/DashboardPage/DashboardContainer/hooks/useDashboardVariableNames',
	() => ({ useDashboardVariableNames: (): string[] => [] }),
);

function textSpec(): DashboardtypesPanelSpecDTO {
	return {
		display: { name: 'Runbook', description: 'steps' },
		plugin: { kind: 'signoz/TextPanel', spec: { text: '' } },
		queries: [],
	} as unknown as DashboardtypesPanelSpecDTO;
}

function spec(unit?: string): DashboardtypesPanelSpecDTO {
	return {
		display: { name: 'CPU', description: 'usage' },
		plugin: {
			kind: 'signoz/TimeSeriesPanel',
			spec: unit ? { formatting: { unit } } : {},
		},
		queries: [],
	} as unknown as DashboardtypesPanelSpecDTO;
}

function renderConfigPane(
	overrides: Partial<React.ComponentProps<typeof ConfigPane>> = {},
	chrome?: PanelEditorChrome,
): React.ComponentProps<typeof ConfigPane> {
	const props: React.ComponentProps<typeof ConfigPane> = {
		spec: spec(),
		savedSpec: spec(),
		onChangeSpec: jest.fn(),
		onChangePanelKind: jest.fn(),
		queryType: EQueryType.QUERY_BUILDER,
		legendSeries: [],
		tableColumns: [],
		panel: { kind: 'Panel', spec: spec() } as DashboardtypesPanelDTO,
		panelId: 'panel-1',
		...overrides,
	};

	// Stateful so typed edits feed back into the spec, as the panel editor owns it.
	function Harness(): JSX.Element {
		const [currentSpec, setCurrentSpec] = useState(props.spec);
		return (
			<ConfigPane
				{...props}
				spec={currentSpec}
				onChangeSpec={(next): void => {
					props.onChangeSpec(next);
					setCurrentSpec(next);
				}}
			/>
		);
	}

	render(
		chrome ? (
			<PanelEditorChromeProvider value={chrome}>
				<Harness />
			</PanelEditorChromeProvider>
		) : (
			<Harness />
		),
	);
	return props;
}

function chromeWith(
	overrides: Partial<PanelEditorChrome> = {},
): PanelEditorChrome {
	return {
		collapseQueryPanel: jest.fn(),
		settingsCollapsed: false,
		setSettingsCollapsed: jest.fn(),
		openQuery: undefined,
		setOpenQuery: jest.fn(),
		...overrides,
	};
}

describe('ConfigPane', () => {
	it('renders the seeded title and description', () => {
		renderConfigPane();

		expect(screen.getByTestId('panel-editor-v2-title')).toHaveValue('CPU');
		expect(screen.getByTestId('panel-editor-v2-description')).toHaveValue(
			'usage',
		);
	});

	it('reports title edits through onChangeSpec (into spec.display)', async () => {
		const user = userEvent.setup();
		const { onChangeSpec } = renderConfigPane();

		const title = screen.getByTestId('panel-editor-v2-title');
		await user.clear(title);
		await user.type(title, 'Memory');

		expect(onChangeSpec).toHaveBeenLastCalledWith(
			expect.objectContaining({
				display: { name: 'Memory', description: 'usage' },
			}),
		);
	});

	// It hides the title strip, so it sits with the title rather than under the
	// display options — and only a kind whose spec accepts `headerOptions` shows it.
	it('renders the hide-header toggle among the Panel Details fields', () => {
		renderConfigPane({ spec: textSpec() });

		const toggle = screen.getByTestId('panel-header-hide');
		expect(toggle).toBeInTheDocument();
		expect(screen.getByText('Hide panel header')).toBeInTheDocument();
		// No collapsible wrapper of its own.
		expect(screen.queryByText('Panel header')).not.toBeInTheDocument();
	});

	it('omits the hide-header toggle for a kind that has no header options', () => {
		renderConfigPane();

		expect(screen.queryByTestId('panel-header-hide')).not.toBeInTheDocument();
	});

	it('renders the Formatting section for a kind that declares it', () => {
		renderConfigPane();
		// The TimeSeries kind declares a Formatting section; its collapsible header shows.
		expect(
			screen.getByTestId('config-section-formatting-&-units'),
		).toBeInTheDocument();
	});

	it('renders the Actions group for a create-alert-capable panel', () => {
		// renderConfigPane defaults to a TimeSeries panel, which can seed an alert.
		renderConfigPane();

		expect(screen.getByText('Actions')).toBeInTheDocument();
		expect(
			screen.getByTestId('panel-editor-v2-create-alert'),
		).toBeInTheDocument();
	});

	it('omits the create-alert action for a kind that cannot seed an alert', () => {
		// Table panels can't seed alerts → the Actions group hides its row. Only the
		// panel passed to ConfigActions needs the kind; sections are asserted elsewhere.
		const panel = {
			kind: 'Panel',
			spec: { ...spec(), plugin: { kind: 'signoz/TablePanel', spec: {} } },
		} as DashboardtypesPanelDTO;
		renderConfigPane({ panel });

		expect(
			screen.queryByTestId('panel-editor-v2-create-alert'),
		).not.toBeInTheDocument();
	});

	it('summarizes a collapsed section on one line', () => {
		renderConfigPane({ spec: spec('ms') });

		expect(
			screen.getByTestId('config-section-summary-formatting-&-units'),
		).toHaveTextContent('Milliseconds (ms) · 2 decimals');
		expect(
			screen.getByTestId('config-section-summary-thresholds'),
		).toHaveTextContent('None');
	});

	it('collapses every open section with Collapse all', async () => {
		const user = userEvent.setup();
		renderConfigPane();

		await user.click(screen.getByTestId('config-section-axes'));
		expect(screen.getByTestId('config-section-axes')).toHaveAttribute(
			'aria-expanded',
			'true',
		);

		await user.click(screen.getByTestId('panel-editor-collapse-sections'));

		expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0);
		expect(
			screen.queryByTestId('panel-editor-collapse-sections'),
		).not.toBeInTheDocument();
	});

	it('collapses the pane through the editor frame', async () => {
		const user = userEvent.setup();
		const chrome = chromeWith();
		renderConfigPane({}, chrome);

		await user.click(screen.getByTestId('panel-editor-collapse-settings'));

		expect(chrome.setSettingsCollapsed).toHaveBeenCalledWith(true);
	});

	it('shows a rail of sections when collapsed, opening the pane on one', async () => {
		const user = userEvent.setup();
		const chrome = chromeWith({ settingsCollapsed: true });
		renderConfigPane({}, chrome);

		expect(screen.queryByTestId('panel-editor-v2-title')).not.toBeInTheDocument();
		expect(screen.getByTestId('panel-editor-settings-rail')).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Legend' }));

		expect(chrome.setSettingsCollapsed).toHaveBeenCalledWith(false);
	});
});
