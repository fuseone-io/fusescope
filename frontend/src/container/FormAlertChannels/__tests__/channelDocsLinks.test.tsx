import { I18nextProvider } from 'react-i18next';
import { Form } from 'antd';
import { fireEvent, render, screen } from '@testing-library/react';
import { fuseScopeDocsUrl } from 'constants/docs';
import { createInstance } from 'i18next';

import en from '../../../../public/locales/en/channels.json';
import enGB from '../../../../public/locales/en-GB/channels.json';
import MsTeams from '../Settings/MsTeams';
import Pager from '../Settings/Pager';
import Slack from '../Settings/Slack';
import Webhook from '../Settings/Webhook';

describe.each([
	{ lng: 'en', channels: en },
	{ lng: 'en-GB', channels: enGB },
])('notification-channel docs ($lng)', ({ lng, channels }) => {
	it.each([
		{ name: 'Webhook', Settings: Webhook },
		{ name: 'Slack', Settings: Slack },
		{ name: 'PagerDuty', Settings: Pager },
		{ name: 'Microsoft Teams', Settings: MsTeams },
	])('$name uses the configured FuseScope docs URL', async ({ Settings }) => {
		const i18n = createInstance();
		await i18n.init({
			lng,
			resources: { [lng]: { channels } },
			interpolation: { escapeValue: false },
		});
		render(
			<I18nextProvider i18n={i18n}>
				<Form>
					<Settings setSelectedConfig={jest.fn()} />
				</Form>
			</I18nextProvider>,
		);

		fireEvent.mouseOver(screen.getByRole('img', { name: 'question-circle' }));
		const link = await screen.findByRole('link', { name: 'here' });
		expect(link).toHaveAttribute(
			'href',
			fuseScopeDocsUrl('/alerts/notification-channels/#channel-types'),
		);
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});
});
