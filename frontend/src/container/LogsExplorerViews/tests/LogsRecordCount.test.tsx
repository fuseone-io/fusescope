import { VirtuosoMockContext } from 'react-virtuoso';
import { LOCALSTORAGE } from 'constants/localStorage';
import { PANEL_TYPES } from 'constants/queryBuilder';
import ROUTES from 'constants/routes';
import { useGetExplorerQueryRange } from 'hooks/queryBuilder/useGetExplorerQueryRange';
import { PreferenceContextProvider } from 'providers/preferences/context/PreferenceContextProvider';
import { render, RenderResult, waitFor } from 'tests/test-utils';

import LogsExplorerViews from '..';
import { useLogsRecordCount } from '../useLogsRecordCount';
import { logsQueryRangeSuccessNewFormatResponse } from './mock';

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useLocation: (): { pathname: string } => ({
		pathname: `${ROUTES.LOGS_EXPLORER}`,
	}),
}));

// mocking the graph components in this test as this should be handled separately
jest.mock(
	'container/TimeSeriesView/TimeSeriesView',
	() =>
		// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
		function TimeSeriesView() {
			return <div>Time Series Chart</div>;
		},
);
jest.mock(
	'container/LogsExplorerChart',
	() =>
		// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
		function LogsExplorerChart() {
			return <div>Histogram Chart</div>;
		},
);

jest.mock('constants/panelTypes', () => ({
	AVAILABLE_EXPORT_PANEL_TYPES: ['graph', 'table'],
}));

jest.mock('d3-interpolate', () => ({
	interpolate: jest.fn(),
}));

jest.mock('hooks/queryBuilder/useGetExplorerQueryRange', () => ({
	__esModule: true,
	useGetExplorerQueryRange: jest.fn(),
}));

jest.mock('hooks/useSafeNavigate', () => ({
	useSafeNavigate: (): any => ({
		safeNavigate: jest.fn(),
	}),
}));

// Mock usePreferenceSync
jest.mock('providers/preferences/sync/usePreferenceSync', () => ({
	usePreferenceSync: (): any => ({
		preferences: {
			columns: [],
			formatting: {
				maxLines: 1,
				format: 'table',
				fontSize: 'small',
				version: 1,
			},
		},
		loading: false,
		error: null,
		updateColumns: jest.fn(),
		updateFormatting: jest.fn(),
	}),
}));

jest.mock('hooks/logs/useCopyLogLink', () => ({
	useCopyLogLink: jest.fn().mockReturnValue({
		activeLogId: undefined,
	}),
}));

// Set up the specific behavior for useGetExplorerQueryRange in individual test cases
beforeEach(() => {
	(useGetExplorerQueryRange as jest.Mock).mockReturnValue({
		data: { payload: logsQueryRangeSuccessNewFormatResponse },
	});
});

const renderer = (): RenderResult =>
	render(
		<VirtuosoMockContext.Provider
			value={{ viewportHeight: 300, itemHeight: 100 }}
		>
			<PreferenceContextProvider>
				<LogsExplorerViews
					setIsLoadingQueries={(): void => {}}
					listQueryKeyRef={{ current: {} }}
					chartQueryKeyRef={{ current: {} }}
					setWarning={(): void => {}}
					showLiveLogs={false}
					handleChangeSelectedView={(): void => {}}
				/>
			</PreferenceContextProvider>
		</VirtuosoMockContext.Provider>,
	);

const chartPayload = {
	data: {
		result: [
			{
				metric: { severity_text: 'INFO', severity_number: '9' },
				queryName: 'A',
				values: [
					[1, '1000'],
					[2, '2000'],
				],
			},
			{
				metric: { severity_text: 'Error', severity_number: '17' },
				queryName: 'A',
				values: [[2, '254']],
			},
		],
	},
};

const queryRange = useGetExplorerQueryRange as jest.Mock;
// Stable references, as react-query returns them, so effects keyed on data settle.
const chartResult = { data: { payload: chartPayload } };
const listResult = {
	data: { payload: logsQueryRangeSuccessNewFormatResponse },
};

describe('Logs record count', () => {
	beforeEach(() => {
		queryRange.mockReset();
		queryRange.mockImplementation((_query, panelType) =>
			panelType === PANEL_TYPES.TIME_SERIES ? chartResult : listResult,
		);
		useLogsRecordCount.setState({ count: null });
	});

	afterEach(() => localStorage.clear());

	it('sums the frequency chart buckets', async () => {
		localStorage.setItem(LOCALSTORAGE.SHOW_FREQUENCY_CHART, 'true');
		renderer();

		await waitFor(() => expect(useLogsRecordCount.getState().count).toBe(3254));
	});

	it('fetches nothing beyond the list and the chart it sums', async () => {
		localStorage.setItem(LOCALSTORAGE.SHOW_FREQUENCY_CHART, 'true');
		renderer();

		await waitFor(() => expect(useLogsRecordCount.getState().count).toBe(3254));
		const panelTypes = new Set(queryRange.mock.calls.map((call) => call[1]));
		expect(panelTypes).toStrictEqual(
			new Set([PANEL_TYPES.TIME_SERIES, PANEL_TYPES.LIST]),
		);
	});

	it('has no count while the frequency chart is off', async () => {
		localStorage.setItem(LOCALSTORAGE.SHOW_FREQUENCY_CHART, 'false');
		renderer();

		await waitFor(() => expect(queryRange).toHaveBeenCalled());
		expect(useLogsRecordCount.getState().count).toBeNull();
		const chartCall = queryRange.mock.calls.find(
			(call) => call[1] === PANEL_TYPES.TIME_SERIES,
		);
		expect(chartCall?.[3]?.enabled).toBe(false);
	});
});
