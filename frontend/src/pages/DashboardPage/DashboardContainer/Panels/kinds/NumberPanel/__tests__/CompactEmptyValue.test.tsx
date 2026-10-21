import {
	type DashboardtypesPanelDTO,
	type QueryRangeV5200,
} from 'api/generated/services/fuseScope.schemas';
import { PanelMode } from 'lib/visualization/panels/types';
import type { PanelQueryData } from 'pages/DashboardPage/DashboardContainer/queryV5/types';
import { render, screen, userEvent } from 'tests/test-utils';

import { BaseRendererProps } from '../../../types/rendererProps';
import { useCompactEmptyValueStore } from '../compactEmptyValueStore';
import BaseNumberPanelRenderer from '../Renderer';

const NumberPanelRenderer =
	BaseNumberPanelRenderer as React.FC<BaseRendererProps>;

window.ResizeObserver =
	window.ResizeObserver ||
	jest.fn().mockImplementation(() => ({
		disconnect: jest.fn(),
		observe: jest.fn(),
		unobserve: jest.fn(),
	}));

const panel = {
	kind: 'Panel',
	spec: { plugin: { kind: 'signoz/NumberPanel', spec: {} } },
} as unknown as DashboardtypesPanelDTO;

const emptyData: PanelQueryData = {
	response: {
		status: 'success',
		data: { type: 'scalar', data: { results: [] } },
	} as unknown as QueryRangeV5200,
	requestPayload: undefined,
	legendMap: {},
};

const zeroData: PanelQueryData = {
	response: {
		status: 'success',
		data: {
			type: 'scalar',
			data: {
				results: [
					{
						queryName: 'A',
						columns: [
							{
								name: '__result',
								queryName: 'A',
								columnType: 'aggregation',
								aggregationIndex: 0,
							},
						],
						data: [[0]],
					},
				],
			},
		},
	} as unknown as QueryRangeV5200,
	requestPayload: undefined,
	legendMap: {},
};

function renderPanel(
	data: PanelQueryData,
	{ compact, isFetching = false }: { compact: boolean; isFetching?: boolean },
): void {
	const element = (
		<NumberPanelRenderer
			panelId="panel-1"
			panel={panel}
			data={data}
			isFetching={isFetching}
			error={null}
			panelMode={PanelMode.DASHBOARD_VIEW}
		/>
	);
	useCompactEmptyValueStore
		.getState()
		.setCompactPanelIds(compact ? ['panel-1'] : ['another-panel']);
	render(element);
}

describe('NumberPanel compact empty value', () => {
	it('shows a dash and "No data" with the full message in a tooltip', async () => {
		renderPanel(emptyData, { compact: true });

		const empty = screen.getByTestId('number-panel-compact-no-data');
		expect(empty).toHaveTextContent('—');
		expect(empty).toHaveTextContent('No data');
		expect(screen.queryByTestId('number-panel-no-data')).not.toBeInTheDocument();

		await userEvent.hover(empty);
		expect(
			(await screen.findAllByText('No data in this time range')).length,
		).toBeGreaterThan(0);
	});

	it.each([
		[
			'outside a compact strip',
			emptyData,
			{ compact: false },
			'number-panel-no-data',
		],
		['while fetching', emptyData, { compact: true, isFetching: true }, null],
	])('keeps the full empty state %s', (_name, data, options, testId) => {
		renderPanel(data, options);

		expect(
			screen.queryByTestId('number-panel-compact-no-data'),
		).not.toBeInTheDocument();
		if (testId) {
			expect(screen.getByTestId(testId)).toBeInTheDocument();
		}
	});

	it('shows a real zero as a value', () => {
		renderPanel(zeroData, { compact: true });

		expect(screen.getByText('0')).toBeInTheDocument();
		expect(
			screen.queryByTestId('number-panel-compact-no-data'),
		).not.toBeInTheDocument();
	});
});
