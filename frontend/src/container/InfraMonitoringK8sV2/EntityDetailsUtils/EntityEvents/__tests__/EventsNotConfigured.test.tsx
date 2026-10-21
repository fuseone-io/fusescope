import { render, screen } from '@testing-library/react';
import { fuseScopeDocsUrl } from 'constants/docs';

import EventsNotConfigured from '../EventsNotConfigured';

describe('EventsNotConfigured', () => {
	it('links to the Kubernetes events setup', () => {
		render(<EventsNotConfigured />);

		expect(
			screen.getByRole('link', { name: /Learn how to configure/ }),
		).toHaveAttribute(
			'href',
			fuseScopeDocsUrl('/sending-data/kubernetes/#kubernetes-events'),
		);
	});
});
