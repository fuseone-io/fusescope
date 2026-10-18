import { render, screen, within } from '@testing-library/react';

import SystemPagePanel from '../SystemPagePanel';

describe('SystemPagePanel', () => {
	it('renders a titled region with description, details, actions and footer', () => {
		render(
			<SystemPagePanel
				testId="system-page"
				icon={<svg />}
				eyebrow="Trial ended"
				title="Upgrade to continue"
				description="Your data is safe."
				actions={<button type="button">Upgrade</button>}
				footer={<a href="mailto:support@example.com">Contact Us</a>}
				extra={<p>FAQ</p>}
			>
				<p>details</p>
			</SystemPagePanel>,
		);

		const panel = screen.getByRole('region', { name: 'Upgrade to continue' });
		expect(
			within(panel).getByRole('heading', {
				level: 1,
				name: 'Upgrade to continue',
			}),
		).toBeInTheDocument();
		expect(within(panel).getByText('Trial ended')).toBeInTheDocument();
		expect(within(panel).getByText('Your data is safe.')).toBeInTheDocument();
		expect(within(panel).getByText('details')).toBeInTheDocument();
		expect(
			within(panel).getByRole('button', { name: 'Upgrade' }),
		).toBeInTheDocument();
		expect(
			within(panel).getByRole('link', { name: 'Contact Us' }),
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId('system-page')).getByText('FAQ'),
		).toBeInTheDocument();
	});

	// Legacy widgets passed as details or extra keep their own styles.
	it('scopes its own markup, not the details or extra, to the new UI reset', () => {
		render(
			<SystemPagePanel
				icon={<svg />}
				title="Access Restricted"
				actions={<button type="button">Home</button>}
				extra={<p data-testid="legacy-extra">tabs</p>}
			>
				<p data-testid="legacy-details">form</p>
			</SystemPagePanel>,
		);

		expect(screen.getByRole('heading').closest('.fs-ui')).not.toBeNull();
		expect(screen.getByTestId('system-page-panel-actions')).toHaveClass('fs-ui');
		expect(screen.getByTestId('legacy-details').closest('.fs-ui')).toBeNull();
		expect(screen.getByTestId('legacy-extra').closest('.fs-ui')).toBeNull();
	});

	it('shows placeholders instead of the content while loading', () => {
		render(
			<SystemPagePanel
				loading
				icon={<svg />}
				title="Upgrade to continue"
				actions={<button type="button">Upgrade</button>}
			/>,
		);

		expect(screen.getByTestId('system-page-panel-loading')).toBeInTheDocument();
		expect(screen.queryByRole('heading')).not.toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});
});
