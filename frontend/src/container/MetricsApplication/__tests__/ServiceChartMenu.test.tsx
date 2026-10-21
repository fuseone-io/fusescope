import ChartPointPopover from 'components/ChartPointPopover/ChartPointPopover';
import ROUTES from 'constants/routes';
import { PanelPoint } from 'container/WidgetCard/Panels/pointMenu.types';
import { fireEvent, render, screen } from 'tests/test-utils';
import { Query } from 'types/api/queryBuilder/queryBuilderData';

import { useServiceChartMenu } from '../hooks/useServiceChartMenu';
import { useGetAPMToLogsQueries, useGetAPMToTracesQueries } from '../Tabs/util';

const mockSafeNavigate = jest.fn();
jest.mock('hooks/useSafeNavigate', () => ({
	useSafeNavigate: (): { safeNavigate: jest.Mock } => ({
		safeNavigate: mockSafeNavigate,
	}),
}));

jest.mock('hooks/useResourceAttribute', () => ({
	...jest.requireActual('hooks/useResourceAttribute'),
	__esModule: true,
	default: (): unknown => ({
		queries: [
			{
				id: 'env',
				tagKey: 'resource_deployment.environment',
				operator: 'IN',
				tagValue: ['prod'],
			},
		],
	}),
}));

const POINT: PanelPoint = {
	timestamp: 1_700_000_000,
	timeRange: { startTime: 1_700_000_000, endTime: 1_700_000_060 },
	labels: { address: 'mysql:3306' },
};

const APM_POINT: PanelPoint = {
	...POINT,
	timeRange: { startTime: 1_699_999_940, endTime: 1_700_000_060 },
};

const onClose = jest.fn();

function Menu({
	withApis = false,
	point = POINT,
}: {
	withApis?: boolean;
	point?: PanelPoint;
}): JSX.Element {
	const tracesQuery = useGetAPMToTracesQueries({ servicename: 'frontend' });
	const logsQuery = useGetAPMToLogsQueries({ servicename: 'frontend' });
	const menuFor = useServiceChartMenu('frontend');
	const { actions, context } = menuFor({
		tracesQuery,
		logsQuery,
		externalApis: withApis ? { isError: false } : undefined,
	})(point);
	return (
		<ChartPointPopover
			anchor={{ left: 0, top: 0, height: 100 }}
			time="22:13:20 UTC"
			actions={actions}
			context={context}
			onClose={onClose}
		/>
	);
}

function navigatedTo(): URL {
	const [path] = mockSafeNavigate.mock.calls[0];
	return new URL(path, 'http://x');
}

function filterOf(url: URL): string {
	const query: Query = JSON.parse(url.searchParams.get('compositeQuery') ?? '');
	return JSON.stringify(query.builder.queryData[0].filters?.items);
}

describe('Service chart point menu', () => {
	beforeEach(() => {
		mockSafeNavigate.mockClear();
		onClose.mockClear();
	});

	it('opens the traces of the service in the clicked bucket, with its filters', () => {
		render(<Menu />);

		fireEvent.click(
			screen.getByRole('menuitem', { name: 'View traces at this time' }),
		);

		const url = navigatedTo();
		expect(url.pathname).toBe(ROUTES.TRACES_EXPLORER);
		expect(url.searchParams.get('startTime')).toBe('1700000000000');
		expect(url.searchParams.get('endTime')).toBe('1700000060000');
		expect(url.searchParams.has('relativeTime')).toBe(false);
		expect(filterOf(url)).toContain('"value":"frontend"');
		expect(filterOf(url)).toContain('"key":"deployment.environment"');
		expect(onClose).toHaveBeenCalled();
	});

	it('opens the logs of the service in the clicked bucket, with its filters', () => {
		render(<Menu />);

		fireEvent.click(
			screen.getByRole('menuitem', { name: 'View logs at this time' }),
		);

		const url = navigatedTo();
		expect(url.pathname).toBe(ROUTES.LOGS_EXPLORER);
		expect(url.searchParams.get('startTime')).toBe('1700000000000');
		expect(url.searchParams.get('endTime')).toBe('1700000060000');
		expect(filterOf(url)).toContain('"value":"frontend"');
		expect(filterOf(url)).toContain('"key":"deployment.environment"');
	});

	it('offers the clicked address in External APIs', () => {
		render(<Menu withApis />);

		fireEvent.click(screen.getByRole('menuitem', { name: 'View External APIs' }));

		const url = navigatedTo();
		expect(url.pathname).toBe(ROUTES.API_MONITORING);
		expect(url.searchParams.get('apiMonitoringParams')).toContain(
			'"selectedDomain":"mysql:3306"',
		);
	});

	it('offers External APIs only on External charts', () => {
		render(<Menu />);

		expect(
			screen.queryByRole('menuitem', { name: 'View External APIs' }),
		).not.toBeInTheDocument();
	});

	it('describes the bucket the links open, the service and its env', () => {
		const { unmount } = render(<Menu />);

		expect(
			screen.getByText(
				'1 min from the point · service.name = frontend · deployment.environment = prod',
			),
		).toBeInTheDocument();
		unmount();

		render(<Menu point={APM_POINT} />);

		expect(
			screen.getByText(
				'±1 min around the point · service.name = frontend · deployment.environment = prod',
			),
		).toBeInTheDocument();
	});
});
