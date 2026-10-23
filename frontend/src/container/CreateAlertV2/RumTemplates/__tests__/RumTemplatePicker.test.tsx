import { safeNavigateMock } from '__tests__/safeNavigateMock';
import userEvent from '@testing-library/user-event';
import { alertLink } from 'lib/rum/__tests__/alertLink';
import { rumAlertUrl } from 'lib/rum/alertTemplates';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen } from 'tests/test-utils';
import { AlertTypes } from 'types/api/alerts/alertTypes';

import RumTemplateMapping from '../RumTemplateMapping';
import RumTemplatePicker from '../RumTemplatePicker';

const mockAlertType = { current: AlertTypes.LOGS_BASED_ALERT };
jest.mock('container/CreateAlertV2/context', () => ({
	useCreateAlertState: (): unknown => ({
		alertType: mockAlertType.current,
		isEditMode: false,
	}),
}));

const APPS = [
	{ id: 'app-1', name: 'web-shop' },
	{ id: 'app-2', name: 'back-office' },
];

function serveApplications(apps: unknown[] = APPS, status = 200): void {
	server.use(
		rest.get('*/api/v1/rum/applications', (_req, res, ctx) =>
			res(ctx.status(status), ctx.json({ status: 'success', data: apps })),
		),
	);
}

function navigatedTo(): HTMLElement {
	const anchor = document.createElement('a');
	anchor.setAttribute('href', String(safeNavigateMock.mock.calls.at(-1)?.[0]));
	return anchor;
}

const TEMPLATE_URL = rumAlertUrl('session_error_rate', {
	applicationId: 'app-2',
	applicationName: 'back-office',
});

beforeEach(() => {
	mockAlertType.current = AlertTypes.LOGS_BASED_ALERT;
});

describe('RumTemplatePicker', () => {
	it('fills the editor from a template for the first application', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveApplications();
		render(<RumTemplatePicker />, undefined, { initialRoute: '/alerts/new' });

		const cards = await screen.findAllByTestId(
			/^rum-template-(lcp_p75|session_error_rate|js_error_count)$/,
		);
		expect(cards.map((card) => card.getAttribute('aria-pressed'))).toStrictEqual([
			'false',
			'false',
			'false',
		]);
		await user.click(screen.getByTestId('rum-template-lcp_p75'));

		expect(alertLink(navigatedTo())).toStrictEqual({
			template: 'lcp_p75',
			applicationId: 'app-1',
			ruleName: 'web-shop LCP p75 above 2.5 s',
			filters: [
				"attribute.event.name = 'browser.web_vital' AND browser.web_vital.name = 'lcp' AND fusescope.rum.application.id = 'app-1'",
			],
			groupBy: [['fusescope.rum.view.route']],
		});
	});

	it('marks the template in the URL and moves it to another application', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveApplications();
		render(<RumTemplatePicker />, undefined, { initialRoute: TEMPLATE_URL });

		await expect(
			screen.findByTestId('rum-template-session_error_rate'),
		).resolves.toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByTestId('rum-template-application')).toHaveValue('app-2');

		await user.selectOptions(
			screen.getByTestId('rum-template-application'),
			'app-1',
		);

		expect(alertLink(navigatedTo())).toMatchObject({
			template: 'session_error_rate',
			applicationId: 'app-1',
			ruleName: 'web-shop session error rate above 5%',
		});
	});

	it.each([
		['no applications', (): void => serveApplications([])],
		['RUM disabled', (): void => serveApplications([], 501)],
	])('stays hidden with %s', async (_name, serve) => {
		serve();
		render(<RumTemplatePicker />, undefined, { initialRoute: '/alerts/new' });

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(screen.queryByTestId('rum-template-picker')).not.toBeInTheDocument();
	});

	it('stays hidden for other alert types', async () => {
		mockAlertType.current = AlertTypes.METRICS_BASED_ALERT;
		serveApplications();
		render(<RumTemplatePicker />, undefined, { initialRoute: '/alerts/new' });

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(screen.queryByTestId('rum-template-picker')).not.toBeInTheDocument();
	});
});

describe('RumTemplateMapping', () => {
	it('explains how the template reads frontend data', () => {
		render(<RumTemplateMapping />, undefined, { initialRoute: TEMPLATE_URL });

		const card = screen.getByTestId('rum-template-mapping');
		expect(card).toHaveTextContent('How this maps to frontend data');
		expect(card).toHaveTextContent('A / B * 100');
		expect(card).toHaveTextContent('count_distinct(session.id)');
	});

	it('renders nothing without a template', () => {
		render(<RumTemplateMapping />, undefined, { initialRoute: '/alerts/new' });

		expect(screen.queryByTestId('rum-template-mapping')).not.toBeInTheDocument();
	});
});
