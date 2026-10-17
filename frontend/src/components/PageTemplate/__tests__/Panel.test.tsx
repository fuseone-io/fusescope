import { render, screen, within } from '@testing-library/react';

import Panel from '../components/Panel';

describe('Panel', () => {
	it('renders a titled section with subtitle, actions and body', () => {
		render(
			<Panel
				title="Key operations"
				subtitle="Sorted by p99"
				actions={<button type="button">Download</button>}
				testId="key-operations"
			>
				<p>rows</p>
			</Panel>,
		);

		const panel = screen.getByRole('region', { name: 'Key operations' });
		expect(panel).toHaveAttribute('data-testid', 'key-operations');
		expect(
			within(panel).getByRole('heading', { level: 2, name: 'Key operations' }),
		).toBeInTheDocument();
		expect(within(panel).getByText('Sorted by p99')).toBeInTheDocument();
		expect(
			within(panel).getByRole('button', { name: 'Download' }),
		).toBeInTheDocument();
		expect(within(panel).getByText('rows')).toBeInTheDocument();
	});

	// Legacy widgets in the body keep their own styles: the reset only scopes the header.
	it('scopes the header, not the body, to the new UI reset', () => {
		render(
			<Panel title="Latency">
				<p data-testid="legacy">chart</p>
			</Panel>,
		);

		expect(screen.getByTestId('panel-header')).toHaveClass('fs-ui');
		expect(screen.getByTestId('legacy').closest('.fs-ui')).toBeNull();
	});

	it('renders just the body when it has no header', () => {
		render(
			<Panel>
				<p>chart</p>
			</Panel>,
		);

		expect(screen.queryByTestId('panel-header')).not.toBeInTheDocument();
		expect(screen.getByText('chart')).toBeInTheDocument();
	});
});
