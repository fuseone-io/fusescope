import CreateAlertChannels from 'container/CreateAlertChannels';
import { ChannelType } from 'container/CreateAlertChannels/config';
import { SlackInitialConfig } from 'container/CreateAlertChannels/defaults';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';

const successNotification = jest.fn();
jest.mock('hooks/useNotifications', () => ({
	__esModule: true,
	useNotifications: jest.fn(() => ({
		notifications: { success: successNotification, error: jest.fn() },
	})),
}));

jest.mock('components/MarkdownRenderer/MarkdownRenderer', () => ({
	MarkdownRenderer: jest.fn(() => <div>Mocked MarkdownRenderer</div>),
}));

interface PayloadCase {
	name: string;
	type: ChannelType;
	fields: Record<string, string>;
	payload: unknown;
}

const WEBHOOK = 'http://127.0.0.1:9/dummy';

const cases: PayloadCase[] = [
	{
		name: 'slack',
		type: ChannelType.Slack,
		fields: {
			'channel-name-textbox': 'slack-oncall',
			'webhook-url-textbox': WEBHOOK,
			'slack-channel-textbox': '#oncall',
		},
		payload: {
			name: 'slack-oncall',
			slack_configs: [
				{
					send_resolved: true,
					api_url: WEBHOOK,
					channel: '#oncall',
					title: SlackInitialConfig.title,
					text: SlackInitialConfig.text,
				},
			],
		},
	},
	{
		name: 'webhook with basic auth',
		type: ChannelType.Webhook,
		fields: {
			'channel-name-textbox': 'hook',
			'webhook-url-textbox': WEBHOOK,
			'webhook-username-textbox': 'bot',
			'webhook-password-textbox': 'secret',
		},
		payload: {
			name: 'hook',
			webhook_configs: [
				{
					send_resolved: true,
					url: WEBHOOK,
					http_config: { basic_auth: { username: 'bot', password: 'secret' } },
				},
			],
		},
	},
	{
		name: 'webhook with a bearer token',
		type: ChannelType.Webhook,
		fields: {
			'channel-name-textbox': 'hook',
			'webhook-url-textbox': WEBHOOK,
			'webhook-password-textbox': 'token',
		},
		payload: {
			name: 'hook',
			webhook_configs: [
				{
					send_resolved: true,
					url: WEBHOOK,
					http_config: {
						authorization: { type: 'Bearer', credentials: 'token' },
					},
				},
			],
		},
	},
];

describe('Create notification channel payloads', () => {
	afterEach(() => {
		jest.clearAllMocks();
		server.resetHandlers();
	});

	it.each(cases)('saves a $name channel', async ({ type, fields, payload }) => {
		let body: unknown;
		server.use(
			rest.post('http://localhost/api/v1/channels', async (req, res, ctx) => {
				body = await req.json();
				return res(ctx.status(201), ctx.json({ status: 'success', data: 'ok' }));
			}),
		);
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<CreateAlertChannels preType={type} />);

		for (const [testId, value] of Object.entries(fields)) {
			await user.click(screen.getByTestId(testId));
			await user.paste(value);
		}
		await user.click(screen.getByTestId('save-channel-button'));

		await waitFor(() =>
			expect(successNotification).toHaveBeenCalledWith({
				message: 'Success',
				description: 'channel_creation_done',
			}),
		);
		expect(body).toStrictEqual(payload);
	});
});
