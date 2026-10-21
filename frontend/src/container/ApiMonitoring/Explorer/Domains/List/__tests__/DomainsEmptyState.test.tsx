import { render, screen } from '@testing-library/react';
import { fuseScopeDocsUrl } from 'constants/docs';

import DomainsEmptyState from '../DomainsEmptyState';

describe('DomainsEmptyState', () => {
	it('links to the troubleshooting section for missing domains', () => {
		render(<DomainsEmptyState />);

		expect(
			screen.getByRole('link', { name: 'Instrument your HTTP clients' }),
		).toHaveAttribute(
			'href',
			fuseScopeDocsUrl('/analyze/external-apis/#when-no-domains-appear'),
		);
	});
});
