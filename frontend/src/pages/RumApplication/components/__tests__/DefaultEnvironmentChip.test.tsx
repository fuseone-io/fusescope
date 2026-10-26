import userEvent from '@testing-library/user-event';
import { render, screen } from 'tests/test-utils';

import DefaultEnvironmentChip from '../DefaultEnvironmentChip';

describe('DefaultEnvironmentChip', () => {
	it('labels the application environment as the default, SDKs sending their own', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<DefaultEnvironmentChip environment="production" />);

		const chip = screen.getByTestId('rum-overview-environment');
		expect(chip).toHaveTextContent('default env: production');

		await user.hover(chip);
		await expect(screen.findByRole('tooltip')).resolves.toHaveTextContent(
			'SDKs may send their own deployment.environment.name',
		);
	});
});
