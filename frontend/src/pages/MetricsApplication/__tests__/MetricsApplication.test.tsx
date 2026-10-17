import { Route } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { fireEvent, render, screen, within } from 'tests/test-utils';

import MetricsApplication from '../MetricsApplication';

const mockSafeNavigate = jest.fn();

jest.mock('hooks/useSafeNavigate', () => ({
	useSafeNavigate: (): { safeNavigate: jest.Mock } => ({
		safeNavigate: mockSafeNavigate,
	}),
}));

jest.mock('container/MetricsApplication/Tabs/Overview', () => ({
	__esModule: true,
	default: (): JSX.Element => <div>overview tab</div>,
}));
jest.mock('container/MetricsApplication/Tabs/DBCall', () => ({
	__esModule: true,
	default: (): JSX.Element => <div>db tab</div>,
}));
jest.mock('container/MetricsApplication/Tabs/External', () => ({
	__esModule: true,
	default: (): JSX.Element => <div>external tab</div>,
}));

function renderAt(url: string): void {
	render(
		<Route path={ROUTES.SERVICE_METRICS} component={MetricsApplication} />,
		undefined,
		{ initialRoute: url },
	);
}

// Radix tabs activate on mousedown, not click.
function select(tab: HTMLElement): void {
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
}

describe('Service detail page', () => {
	beforeEach(() => mockSafeNavigate.mockClear());

	it('renders the service name as the page heading with its actions', () => {
		renderAt('/services/checkout%20api');

		const heading = screen.getByRole('heading', { level: 1 });
		expect(heading).toHaveTextContent('checkout api');
		expect(heading).toHaveClass('tw:font-mono');

		const actions = within(screen.getByTestId('page-header-actions'));
		expect(actions.getByTestId('service-view-traces')).toBeInTheDocument();
		expect(actions.getByTestId('service-view-logs')).toBeInTheDocument();
		expect(actions.getByText('Settings')).toBeInTheDocument();
	});

	it('links to traces and logs of this service over the selected range', () => {
		renderAt('/services/checkout?relativeTime=30m');

		const traces = screen.getByTestId('service-view-traces');
		const tracesUrl = new URL(traces.getAttribute('href') ?? '', 'http://x');
		expect(tracesUrl.pathname).toBe(ROUTES.TRACES_EXPLORER);
		expect(tracesUrl.searchParams.get('selected')).toBe(
			'{"serviceName":["checkout"]}',
		);
		expect(tracesUrl.searchParams.get('startTime')).toMatch(/^\d+$/);
		expect(tracesUrl.searchParams.get('endTime')).toMatch(/^\d+$/);
		expect(tracesUrl.searchParams.has('relativeTime')).toBe(false);
		expect(tracesUrl.searchParams.get('compositeQuery')).toContain('checkout');

		const logs = screen.getByTestId('service-view-logs');
		const logsUrl = new URL(logs.getAttribute('href') ?? '', 'http://x');
		expect(logsUrl.pathname).toBe(ROUTES.LOGS_EXPLORER);
		expect(logsUrl.searchParams.get('compositeQuery')).toContain('logs');
	});

	it('renders the tabs with Overview active by default', () => {
		renderAt('/services/checkout');

		const tabs = within(
			screen.getByRole('tablist', { name: 'Service sections' }),
		);
		expect(tabs.getAllByRole('tab').map((tab) => tab.textContent)).toStrictEqual([
			'Overview',
			'DB Call Metrics',
			'External Metrics',
		]);
		expect(tabs.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		expect(screen.getByText('overview tab')).toBeInTheDocument();
	});

	it('opens the tab named by ?tab=', () => {
		renderAt('/services/checkout?tab=EXTERNAL_METRICS');

		expect(screen.getByRole('tab', { name: 'External Metrics' })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		expect(screen.getByText('external tab')).toBeInTheDocument();
	});

	it('keeps the tab in ?tab= when switching, with the other params', () => {
		renderAt('/services/checkout?relativeTime=30m');

		select(screen.getByTestId('page-tab-DB_CALL_METRICS'));

		expect(mockSafeNavigate).toHaveBeenCalledWith(
			'/services/checkout?relativeTime=30m&tab=DB_CALL_METRICS',
		);
	});
});
