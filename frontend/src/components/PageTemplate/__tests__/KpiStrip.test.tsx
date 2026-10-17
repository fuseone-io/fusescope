import { render, screen, within } from '@testing-library/react';

import KpiStrip from '../components/KpiStrip';
import Stat from '../components/Stat';

describe('KpiStrip', () => {
	it('renders a labelled region of stats with value, unit and note', () => {
		render(
			<KpiStrip label="RED metrics">
				<Stat label="Requests" value="2.41" unit="ops/s" testId="stat-requests" />
				<Stat label="Error rate" value="1.90" unit="%" note="of all calls" />
			</KpiStrip>,
		);

		const region = screen.getByRole('region', { name: 'RED metrics' });
		expect(region).toHaveClass('fs-ui');

		const requests = within(screen.getByTestId('stat-requests'));
		expect(requests.getByText('Requests')).toBeInTheDocument();
		expect(requests.getByText('2.41')).toBeInTheDocument();
		expect(requests.getByText('ops/s')).toBeInTheDocument();

		expect(within(region).getByText('of all calls')).toBeInTheDocument();
	});
});
