import { render, screen } from '@testing-library/react';
import { fuseScopeDocsUrl } from 'constants/docs';

import MeterBillingNote from '../MeterBillingNote';

describe('MeterBillingNote', () => {
	it('links to the Cost Meter setup', () => {
		render(<MeterBillingNote onDismiss={jest.fn()} />);

		expect(screen.getByTestId('meter-billing-note')).toHaveTextContent(
			'Billing days run in UTC',
		);
		expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
			'href',
			fuseScopeDocsUrl('/analyze/cost-meter/#turn-on-the-cost-meter'),
		);
	});
});
