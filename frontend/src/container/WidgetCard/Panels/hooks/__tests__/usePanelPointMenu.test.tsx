import { act, renderHook } from '@testing-library/react';
import { UseQueryResult } from 'react-query';
import { PanelPoint } from 'container/WidgetCard/Panels/pointMenu.types';
import { usePanelContextMenu } from 'container/WidgetCard/Panels/hooks/usePanelContextMenu';
import { MetricQueryRangeSuccessResponse } from 'types/api/metrics/getQueryRange';
import { Widgets } from 'types/api/widgets/widget';

jest.mock('container/QueryTable/Drilldown/useGraphContextMenu', () => ({
	__esModule: true,
	default: (): { menuItemsConfig: { items: string } } => ({
		menuItemsConfig: { items: 'generic-drilldown' },
	}),
}));

const widget = {
	id: 'w-1',
	query: {
		builder: {
			queryData: [
				{
					queryName: 'A',
					dataSource: 'traces',
					stepInterval: 60,
					aggregateAttribute: { key: '' },
				},
			],
		},
	},
} as unknown as Widgets;

const queryResponse = {
	data: undefined,
	isLoading: false,
} as unknown as UseQueryResult<MetricQueryRangeSuccessResponse, Error>;

function clickPoint(handler: (...args: unknown[]) => void): void {
	act(() => {
		handler(
			1_700_000_030, // xValue, between points
			5, // yValue
			0, // mouseX
			0, // mouseY
			{ address: 'mysql', clickedTimestamp: 1_700_000_000 }, // metric
			{ queryName: 'A', inFocusOrNot: true }, // queryData
			10, // absoluteMouseX
			20, // absoluteMouseY
			{}, // axesData
			{ seriesIndex: 1, seriesName: 'mysql', value: 5, color: '#abc' },
		);
	});
}

describe('usePanelContextMenu with a point menu', () => {
	it('opens the point menu at the click, for the clicked bucket and series', () => {
		const pointMenu = jest.fn((point: PanelPoint) => `menu ${point.timestamp}`);

		const { result } = renderHook(() =>
			usePanelContextMenu({ widget, queryResponse, pointMenu }),
		);

		clickPoint(result.current.clickHandlerWithContextMenu);

		expect(result.current.coordinates).toStrictEqual({ x: 10, y: 20 });
		expect(result.current.menuItemsConfig.items).toBe('menu 1700000000');
		expect(pointMenu).toHaveBeenLastCalledWith(
			{
				timestamp: 1_700_000_000,
				timeRange: { startTime: 1_700_000_000, endTime: 1_700_000_060 },
				labels: { address: 'mysql' },
			},
			result.current.onClose,
		);
	});

	it('closes the point menu', () => {
		const { result } = renderHook(() =>
			usePanelContextMenu({
				widget,
				queryResponse,
				pointMenu: (): string => 'menu',
			}),
		);

		clickPoint(result.current.clickHandlerWithContextMenu);
		act(() => result.current.onClose());

		expect(result.current.coordinates).toBeNull();
		expect(result.current.menuItemsConfig).toStrictEqual({});
	});

	it('ignores clicks outside any point', () => {
		const pointMenu = jest.fn();
		const { result } = renderHook(() =>
			usePanelContextMenu({ widget, queryResponse, pointMenu }),
		);

		act(() => {
			result.current.clickHandlerWithContextMenu(
				1_700_000_030,
				0,
				0,
				0,
				{ clickedTimestamp: 1_700_000_030 },
				{ queryName: '', inFocusOrNot: false },
				10,
				20,
			);
		});

		expect(result.current.coordinates).toBeNull();
		expect(pointMenu).not.toHaveBeenCalled();
	});
});
