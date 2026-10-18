import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ROUTES from 'constants/routes';

import { defaultText } from './constant';
import NotFound from './index';

describe('Not Found page test', () => {
	it('says the page was not found and links back home', () => {
		render(
			<MemoryRouter>
				<NotFound />
			</MemoryRouter>,
		);

		expect(screen.getByTestId('not-found')).toBeInTheDocument();
		expect(
			screen.getByRole('heading', { name: 'Page Not Found' }),
		).toBeInTheDocument();
		expect(screen.getByText(defaultText)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /return home/i })).toHaveAttribute(
			'href',
			ROUTES.HOME,
		);
	});

	it('shows the text it is given', () => {
		render(
			<MemoryRouter>
				<NotFound text="No such dashboard" />
			</MemoryRouter>,
		);

		expect(screen.getByText('No such dashboard')).toBeInTheDocument();
	});
});
