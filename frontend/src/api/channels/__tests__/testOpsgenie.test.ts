import axios from 'api';

import testOpsgenie from '../testOpsgenie';

jest.mock('api', () => ({
	post: jest.fn(),
}));

describe('testOpsgenie', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(axios.post as jest.Mock).mockResolvedValue({
			status: 200,
			data: { status: 'success', data: 'ok' },
		});
	});

	it('sends send_resolved=true like the other test channel calls', async () => {
		await testOpsgenie({
			name: 'opsgenie',
			api_key: 'key',
			send_resolved: false,
		});

		expect(axios.post).toHaveBeenCalledWith(
			'/testChannel',
			expect.objectContaining({
				opsgenie_configs: [expect.objectContaining({ send_resolved: true })],
			}),
		);
	});
});
