import { MemoryRouter, Route, Switch, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ROUTES from 'constants/routes';

import ApiMonitoringPage from './ApiMonitoringPage';

// The explorer has its own tests; this one covers the page around it.
jest.mock('container/ApiMonitoring/Explorer/Explorer', () => ({
	__esModule: true,
	default: (): JSX.Element => <div>Mocked Explorer Page</div>,
}));

jest.mock('./DomainsCountLine', () => ({
	__esModule: true,
	default: (): null => null,
}));

function DomainPageProbe(): JSX.Element {
	const { pathname, search } = useLocation();
	return <div data-testid="domain-page">{`${pathname}${search}`}</div>;
}

const renderAt = (url: string): void => {
	render(
		<MemoryRouter initialEntries={[url]}>
			<Switch>
				<Route path={ROUTES.API_MONITORING_DOMAIN} component={DomainPageProbe} />
				<Route path={ROUTES.API_MONITORING} component={ApiMonitoringPage} />
			</Switch>
		</MemoryRouter>,
	);
};

const legacyUrl = (params: Record<string, unknown>): string =>
	`${ROUTES.API_MONITORING}?apiMonitoringParams=${encodeURIComponent(
		JSON.stringify(params),
	)}`;

describe('ApiMonitoringPage', () => {
	it('renders the page header and the explorer', () => {
		renderAt(ROUTES.API_MONITORING);

		expect(
			screen.getByRole('heading', { level: 1, name: 'External APIs' }),
		).toBeInTheDocument();
		expect(screen.getByText('Mocked Explorer Page')).toBeInTheDocument();
	});

	it('stays on the list for list-only params', () => {
		renderAt(legacyUrl({ showIP: false }));

		expect(screen.getByText('Mocked Explorer Page')).toBeInTheDocument();
		expect(screen.queryByTestId('domain-page')).not.toBeInTheDocument();
	});

	it('redirects an old domain drawer link to the domain page', () => {
		renderAt(
			legacyUrl({
				selectedDomain: 'telemetrygen-server',
				selectedView: 'top_errors',
				modalTimeRange: { startTime: 1700000000, endTime: 1700000900 },
			}),
		);

		const target = screen.getByTestId('domain-page').textContent ?? '';
		const [pathname, search] = target.split('?');
		const params = new URLSearchParams(search);

		expect(pathname).toBe('/api-monitoring/domains/telemetrygen-server');
		expect(new URLSearchParams(search).get('apiMonitoringParams')).toContain(
			'top_errors',
		);
		expect(params.get('startTime')).toBe('1700000000000');
		expect(params.get('endTime')).toBe('1700000900000');
		expect(screen.queryByText('Mocked Explorer Page')).not.toBeInTheDocument();
	});
});
