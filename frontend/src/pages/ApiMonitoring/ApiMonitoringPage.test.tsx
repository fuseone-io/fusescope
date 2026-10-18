import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import ApiMonitoringPage from './ApiMonitoringPage';

// The explorer has its own tests; this one covers the page around it.
jest.mock('container/ApiMonitoring/Explorer/Explorer', () => ({
	__esModule: true,
	default: (): JSX.Element => <div>Mocked Explorer Page</div>,
}));

describe('ApiMonitoringPage', () => {
	it('renders the page header and the explorer', () => {
		render(
			<MemoryRouter initialEntries={['/api-monitoring/explorer']}>
				<ApiMonitoringPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole('heading', { level: 1, name: 'External APIs' }),
		).toBeInTheDocument();
		expect(screen.getByText('Mocked Explorer Page')).toBeInTheDocument();
	});
});
