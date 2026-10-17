import { render, screen, within } from '@testing-library/react';

import PageHeader from '../components/PageHeader';

describe('PageHeader', () => {
	it('renders the title as the page heading with its icon, badges, meta and actions', () => {
		render(
			<PageHeader
				title="checkout-api"
				titleMono
				icon={<svg data-testid="entity-icon" />}
				badges={<span>Live</span>}
				description="Every instrumented service"
				meta={[
					{ key: 'env', content: 'production' },
					{ key: 'lang', content: 'Go' },
				]}
				actions={<button type="button">View traces</button>}
			/>,
		);

		const heading = screen.getByRole('heading', { level: 1 });
		expect(heading).toHaveTextContent('checkout-api');
		expect(heading).toHaveClass('tw:font-mono');
		expect(screen.getByTestId('entity-icon')).toBeInTheDocument();
		expect(screen.getByText('Live')).toBeInTheDocument();
		expect(screen.getByText('Every instrumented service')).toBeInTheDocument();

		const meta = within(screen.getByTestId('page-header-meta'));
		expect(meta.getByText('production')).toBeInTheDocument();
		expect(meta.getByText('Go')).toBeInTheDocument();

		expect(
			within(screen.getByTestId('page-header-actions')).getByRole('button', {
				name: 'View traces',
			}),
		).toBeInTheDocument();
	});

	it('leaves out the slots it is not given', () => {
		render(<PageHeader title="Services" />);

		expect(screen.getByRole('heading', { level: 1 })).not.toHaveClass(
			'tw:font-mono',
		);
		expect(screen.queryByTestId('page-header-meta')).not.toBeInTheDocument();
		expect(screen.queryByTestId('page-header-actions')).not.toBeInTheDocument();
		expect(screen.getByTestId('page-header')).toHaveClass('fs-ui');
	});
});
