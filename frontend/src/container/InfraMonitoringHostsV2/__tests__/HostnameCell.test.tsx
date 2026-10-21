import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fuseScopeDocsUrl } from 'constants/docs';

import { HostnameCell } from '../utils';

describe('HostnameCell', () => {
	it('links a missing host.name to the processor that sets it', async () => {
		render(<HostnameCell hostName="" />);

		await userEvent.hover(
			screen.getByRole('img', { name: 'Missing host.name metadata' }),
		);

		await expect(
			screen.findByRole('link', { name: /Learn how to configure/ }),
		).resolves.toHaveAttribute(
			'href',
			fuseScopeDocsUrl('/sending-data/kubernetes/#resourcedetection-processor'),
		);
	});
});
