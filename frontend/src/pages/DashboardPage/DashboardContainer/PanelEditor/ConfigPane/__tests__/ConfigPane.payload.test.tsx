import { type ReactNode, useState } from 'react';
import type {
	DashboardtypesPanelDTO,
	DashboardtypesPanelSpecDTO,
} from 'api/generated/services/fuseScope.schemas';
import {
	AllTheProviders,
	render,
	renderHook,
	screen,
	userEvent,
} from 'tests/test-utils';
import { EQueryType } from 'types/common/dashboard';

import { usePanelEditorSave } from '../../hooks/usePanelEditorSave';
import {
	type PanelEditorChrome,
	PanelEditorChromeProvider,
} from '../../PanelEditorLayout/PanelEditorChromeContext';
import ConfigPane from '../ConfigPane';

jest.mock(
	'pages/DashboardPage/DashboardContainer/hooks/useDashboardEventMeta',
	() => ({
		useDashboardEventMeta: (): {
			dashboardId: string;
			dashboardName: string;
		} => ({
			dashboardId: 'dash-1',
			dashboardName: 'HotROD service health',
		}),
	}),
);
jest.mock(
	'pages/DashboardPage/DashboardContainer/hooks/useDashboardVariableNames',
	() => ({ useDashboardVariableNames: (): string[] => [] }),
);

const mockPatchAsync = jest.fn().mockResolvedValue(undefined);
jest.mock(
	'pages/DashboardPage/DashboardContainer/hooks/useOptimisticPatch',
	() => ({
		useOptimisticPatch: (): unknown => ({
			patchAsync: mockPatchAsync,
			isPatching: false,
			error: null,
		}),
	}),
);

const QUERIES = [
	{
		kind: 'time_series',
		spec: {
			plugin: {
				kind: 'signoz/CompositeQuery',
				spec: {
					queries: [
						{
							type: 'builder_query',
							spec: {
								name: 'A',
								signal: 'metrics',
								aggregations: [
									{
										metricName: 'signoz_calls_total',
										timeAggregation: 'rate',
										spaceAggregation: 'sum',
									},
								],
								groupBy: [{ name: 'service.name' }],
							},
						},
					],
				},
			},
		},
	},
];

function seed(): DashboardtypesPanelSpecDTO {
	return {
		display: { name: 'Calls', description: 'rate of calls' },
		plugin: { kind: 'signoz/TimeSeriesPanel', spec: {} },
		queries: QUERIES,
	} as unknown as DashboardtypesPanelSpecDTO;
}

// What the editor saved for these edits before the redesign: each control
// writes its own field into its slice, in the order it was touched.
const EXPECTED_SPEC = {
	display: { name: 'Calls by service', description: 'rate of calls' },
	plugin: {
		kind: 'signoz/TimeSeriesPanel',
		spec: {
			visualization: { fillSpans: true },
			formatting: { decimalPrecision: '4' },
			legend: { position: 'right' },
			chartAppearance: { lineStyle: 'dashed' },
		},
	},
	queries: QUERIES,
};

const EXPECTED_PAYLOAD = JSON.stringify([
	{ op: 'add', path: '/spec/panels/rate/spec', value: EXPECTED_SPEC },
]);

const chrome: PanelEditorChrome = {
	collapseQueryPanel: jest.fn(),
	settingsCollapsed: false,
	setSettingsCollapsed: jest.fn(),
	openQuery: undefined,
	setOpenQuery: jest.fn(),
};

function renderPane(wrap: (pane: ReactNode) => ReactNode): {
	latest: () => DashboardtypesPanelSpecDTO;
} {
	let current = seed();
	function Harness(): JSX.Element {
		const [spec, setSpec] = useState(seed);
		return (
			<>
				{wrap(
					<ConfigPane
						spec={spec}
						savedSpec={seed()}
						onChangeSpec={(next): void => {
							current = next;
							setSpec(next);
						}}
						onChangePanelKind={jest.fn()}
						queryType={EQueryType.QUERY_BUILDER}
						legendSeries={[]}
						tableColumns={[]}
						panel={{ kind: 'Panel', spec } as DashboardtypesPanelDTO}
						panelId="rate"
					/>,
				)}
			</>
		);
	}
	render(<Harness />);
	return { latest: (): DashboardtypesPanelSpecDTO => current };
}

async function edit(): Promise<void> {
	const user = userEvent.setup();
	const title = screen.getByTestId('panel-editor-v2-title');
	await user.clear(title);
	await user.type(title, 'Calls by service');

	await user.click(screen.getByTestId('panel-editor-v2-fill-spans'));

	await user.click(screen.getByTestId('config-section-formatting-&-units'));
	await user.click(screen.getByLabelText('4'));

	await user.click(screen.getByTestId('config-section-legend'));
	await user.click(screen.getByLabelText('Right of chart'));

	await user.click(screen.getByTestId('config-section-chart-appearance'));
	await user.click(screen.getByLabelText('Dashed'));
}

async function savedPayload(spec: DashboardtypesPanelSpecDTO): Promise<string> {
	mockPatchAsync.mockClear();
	const { result } = renderHook(
		() => usePanelEditorSave({ dashboardId: 'dash-1', panelId: 'rate' }),
		{ wrapper: AllTheProviders },
	);
	await result.current.save(spec);
	return JSON.stringify(mockPatchAsync.mock.calls[0][0]);
}

describe('ConfigPane save payload', () => {
	it.each([
		['on its own', (pane: ReactNode): ReactNode => pane],
		[
			'inside the editor frame',
			(pane: ReactNode): ReactNode => (
				<PanelEditorChromeProvider value={chrome}>{pane}</PanelEditorChromeProvider>
			),
		],
	])(
		'saves byte-identical JSON for the same edits %s',
		async (_name, wrap) => {
			const { latest } = renderPane(wrap);

			await edit();

			expect(JSON.stringify(latest())).toBe(JSON.stringify(EXPECTED_SPEC));
			await expect(savedPayload(latest())).resolves.toBe(EXPECTED_PAYLOAD);
		},
		20000,
	);
});
