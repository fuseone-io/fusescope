import {
	renderAppSidebar,
	sidebarState,
} from 'components/AppSidebar/__tests__/renderAppSidebar';
import { CmdKPalette } from 'components/cmdKPalette/cmdKPalette';
import ROUTES from 'constants/routes';
import { rest, server } from 'mocks-server/server';
import { useGetDashboardV2 } from 'api/generated/services/dashboard';
import {
	fireEvent,
	RenderResult,
	screen,
	userEvent,
	within,
} from 'tests/test-utils';

import AppHeader from '../AppHeader';

jest.mock('container/TopNav/DateTimeSelectionV2', () => ({
	__esModule: true,
	default: ({ showAutoRefresh }: { showAutoRefresh: boolean }): JSX.Element => (
		<div
			data-testid="global-time-picker"
			data-auto-refresh={String(showAutoRefresh)}
		/>
	),
}));

jest.mock('components/HeaderRightSection/HeaderRightSection', () => ({
	__esModule: true,
	default: (): JSX.Element => <div data-testid="header-right-section" />,
}));

beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
		configurable: true,
		value: jest.fn(),
	});
	global.ResizeObserver = class {
		observe(): void {}

		unobserve(): void {}

		disconnect(): void {}
	};
});

function renderHeader(route: string, page?: JSX.Element): RenderResult {
	return renderAppSidebar({
		route,
		content: (
			<>
				<AppHeader />
				<CmdKPalette userRole="ADMIN" />
				{page}
			</>
		),
	});
}

function header(): HTMLElement {
	return screen.getByTestId('app-header');
}

function crumbs(): string[] {
	return within(screen.getByTestId('app-header-breadcrumb'))
		.getAllByRole('listitem')
		.filter((item) => item.getAttribute('aria-hidden') !== 'true')
		.map((item) => item.textContent ?? '');
}

function currentCrumb(): HTMLElement {
	return within(screen.getByTestId('app-header-breadcrumb')).getByRole('link', {
		current: 'page',
	});
}

/** Loads the dashboard the way the dashboard page does. */
function DashboardPageProbe({ id }: { id: string }): null {
	useGetDashboardV2({ id });
	return null;
}

describe('AppHeader', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	describe('breadcrumb', () => {
		it('names a sidebar route after its nav item', () => {
			renderHeader(ROUTES.APPLICATION);

			expect(crumbs()).toStrictEqual(['Services']);
			expect(currentCrumb()).toHaveTextContent('Services');
		});

		it('names a static sub-page under its section', () => {
			renderHeader(ROUTES.LOGS_PIPELINES);

			expect(crumbs()).toStrictEqual(['Logs', 'Pipelines']);
			expect(within(header()).getByRole('link', { name: 'Logs' })).toHaveAttribute(
				'href',
				expect.stringContaining(ROUTES.LOGS_EXPLORER),
			);
		});

		it('shows a service name from the url in mono', () => {
			renderHeader('/services/checkout-api');

			expect(crumbs()).toStrictEqual(['Services', 'checkout-api']);
			expect(currentCrumb()).toHaveClass('tw:font-mono');
			expect(
				within(header()).getByRole('link', { name: 'Services' }),
			).toHaveAttribute('href', expect.stringContaining(ROUTES.APPLICATION));
		});

		it('nests a page under a dynamic parent', () => {
			renderHeader('/services/checkout-api/top-level-operations');

			expect(crumbs()).toStrictEqual([
				'Services',
				'checkout-api',
				'Top level operations',
			]);
		});

		it('shows the dashboard title once the page has loaded it', async () => {
			server.use(
				rest.get('*/api/v2/dashboards/:id', (req, res, ctx) =>
					res(
						ctx.json({
							status: 'success',
							data: {
								id: req.params.id,
								name: 'checkout',
								spec: { display: { name: 'Checkout overview' } },
							},
						}),
					),
				),
			);
			renderHeader('/dashboard/abc', <DashboardPageProbe id="abc" />);

			expect(crumbs()).toStrictEqual(['Dashboards', 'Dashboard']);
			await expect(
				screen.findByText('Checkout overview'),
			).resolves.toBeInTheDocument();
			expect(crumbs()).toStrictEqual(['Dashboards', 'Checkout overview']);
		});
	});

	describe('search', () => {
		it('opens the command palette from the search button', async () => {
			const user = userEvent.setup({ pointerEventsCheck: 0 });
			renderHeader(ROUTES.APPLICATION);

			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
			await user.click(screen.getByTestId('app-header-search'));

			await expect(screen.findByRole('dialog')).resolves.toBeInTheDocument();
		});

		it.each([
			{ shortcut: 'Ctrl+K', modifier: { ctrlKey: true } },
			{ shortcut: '⌘K', modifier: { metaKey: true } },
		])('opens the command palette with $shortcut', async ({ modifier }) => {
			renderHeader(ROUTES.APPLICATION);

			fireEvent.keyDown(window, { key: 'k', ...modifier });

			await expect(screen.findByRole('dialog')).resolves.toBeInTheDocument();
		});
	});

	describe('time range', () => {
		it.each([
			ROUTES.APPLICATION,
			'/services/checkout-api',
			ROUTES.SERVICE_MAP,
			ROUTES.METRICS_EXPLORER,
		])('shows the global picker with auto refresh on %s', (route) => {
			renderHeader(route);

			expect(within(header()).getByTestId('global-time-picker')).toHaveAttribute(
				'data-auto-refresh',
				'true',
			);
			expect(
				within(header()).getByTestId('header-right-section'),
			).toBeInTheDocument();
		});

		it.each([
			ROUTES.HOME,
			ROUTES.LOGS_EXPLORER,
			ROUTES.TRACES_EXPLORER,
			ROUTES.LOGS_INDEX_FIELDS,
			ROUTES.METRICS_EXPLORER_EXPLORER,
			'/traces/funnels/abc',
			'/trace/abc',
			'/dashboard/abc',
			ROUTES.ALERTS_NEW,
			ROUTES.SETTINGS,
			'/ai-assistant/abc',
		])('leaves the picker to the page on %s', (route) => {
			renderHeader(route);

			expect(
				within(header()).queryByTestId('global-time-picker'),
			).not.toBeInTheDocument();
			expect(
				within(header()).queryByTestId('header-right-section'),
			).not.toBeInTheDocument();
		});
	});

	it('toggles the sidebar from the header trigger', async () => {
		const user = userEvent.setup();
		renderHeader(ROUTES.APPLICATION);

		expect(sidebarState()).toBe('collapsed');
		await user.click(within(header()).getByTestId('app-sidebar-trigger'));
		expect(sidebarState()).toBe('expanded');
		await user.click(within(header()).getByTestId('app-sidebar-trigger'));
		expect(sidebarState()).toBe('collapsed');
	});

	it('is the only sidebar trigger', () => {
		renderHeader(ROUTES.APPLICATION);

		expect(document.querySelectorAll('[data-sidebar="trigger"]')).toHaveLength(1);
	});
});
