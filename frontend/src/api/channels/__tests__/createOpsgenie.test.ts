import axios from 'api';

import create from '../createOpsgenie';

jest.mock('api', () => ({
	post: jest.fn(),
}));

describe('createOpsgenie', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(axios.post as jest.Mock).mockResolvedValue({
			status: 201,
			data: { status: 'success', data: 'ok' },
		});
	});

	it.each([true, false])(
		'sends send_resolved=%s in the opsgenie config',
		async (sendResolved) => {
			await create({
				name: 'opsgenie',
				api_key: 'key',
				send_resolved: sendResolved,
			});

			expect(axios.post).toHaveBeenCalledWith(
				'/channels',
				expect.objectContaining({
					opsgenie_configs: [
						expect.objectContaining({ send_resolved: sendResolved }),
					],
				}),
			);
		},
	);
});
