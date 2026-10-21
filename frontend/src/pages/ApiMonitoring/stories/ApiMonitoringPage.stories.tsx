import { Route, Switch } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, screen, userEvent, waitFor } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import { apiMonitoringMocks } from './ApiMonitoringPage.stories.mocks';
import ApiDomainPage from '../ApiDomainPage';
import ApiMonitoringPage from '../ApiMonitoringPage';

type ApiMonitoringArgs = PageStoryArgs<typeof apiMonitoringMocks>;

const pageStory = storyMocks(apiMonitoringMocks, { layout: 'app' });

/** The list and the domain page, as the app routes them. */
function ApiMonitoringRoutes(): JSX.Element {
	return (
		<Switch>
			<Route path={ROUTES.API_MONITORING_DOMAIN} component={ApiDomainPage} />
			<Route component={ApiMonitoringPage} />
		</Switch>
	);
}

/**
 * Third party domains instrumented services call, their endpoints, status codes
 * and the services depending on them. The domain page is a route, so it is a
 * control rather than a play.
 *
 * Routes: `/api-monitoring/explorer`, `/api-monitoring/domains/:domain`.
 */
const meta = {
	title: 'Pages/External APIs',
	tags: ['play'],
	component: ApiMonitoringRoutes,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<ApiMonitoringArgs>;

export default meta;

type Story = StoryObj<ApiMonitoringArgs>;

/**
 * Every external host the workspace called in the window, with the endpoints it
 * uses, how often, how slow and how much of it failed. Clicking a row opens the
 * domain drawer.
 */
export const Default: Story = {};

/**
 * The domain drawer on All Endpoints: the host's own rate, latency and error
 * share above a table of every endpoint under it, groupable by any span
 * attribute.
 */
export const DomainEndpoints: Story = {
	args: { drawer: 'all-endpoints' },
};

/** The endpoint drawer scoped to checkout, which hides dependent services. */
export const ServiceFiltered: Story = {
	args: { drawer: 'endpoint-stats', serviceFilter: true },
};

/** A non-standard-port destination, preserving the endpoint metadata pill. */
export const PortDomain: Story = {
	args: { drawer: 'endpoint-stats', drawerDomain: 'ip-address' },
};

/** The page fetches before it renders a filter, which outlasts the 1s default. */
const untilLoaded = { timeout: 15_000 };

const pickMenuValue = async (
	triggerTestId: string,
	value: string,
): Promise<void> => {
	const trigger = await screen.findByTestId(
		triggerTestId,
		undefined,
		untilLoaded,
	);
	await userEvent.click(trigger);
	await userEvent.click(
		await screen.findByRole('menuitemradio', { name: value }, untilLoaded),
	);
	await waitFor(() => expect(trigger).toHaveTextContent(value), untilLoaded);
};

/** The domain drawer's real empty endpoint-table branch. */
export const EmptyEndpointDrawer: Story = {
	args: { drawer: 'all-endpoints', endpoints: 0 },
};

/** The list narrowed to one environment from the toolbar. */
export const EnvironmentSelected: Story = {
	play: async (): Promise<void> => {
		await pickMenuValue('api-monitoring-environment', 'production');
	},
};

/** The list narrowed to the domains one service calls. */
export const CallingServiceSelected: Story = {
	play: async (): Promise<void> => {
		await pickMenuValue('api-monitoring-service', 'checkout');
	},
};

/** The domain search keeps only the hosts whose name matches. */
export const DomainSearch: Story = {
	play: async (): Promise<void> => {
		await screen.findAllByTestId('domain-row', undefined, untilLoaded);
		const search = screen.getByTestId('api-monitoring-domain-search');
		await userEvent.type(search, 'stripe');
		await waitFor(() => {
			screen
				.getAllByTestId('domain-row')
				.forEach((row) => expect(row).toHaveTextContent(/stripe/i));
		});
	},
};

/** Show IP addresses off: the list drops bare addresses. */
export const IpAddressesHidden: Story = {
	play: async (): Promise<void> => {
		await screen.findAllByTestId('domain-row', undefined, untilLoaded);
		await userEvent.click(screen.getByTestId('api-monitoring-show-ip'));
		await waitFor(() => {
			screen
				.getAllByTestId('domain-row')
				.forEach((row) => expect(row).not.toHaveTextContent(/^\s*\d+\.\d+/));
		}, untilLoaded);
	},
};

/**
 * One endpoint's stats: the services calling it, the codes it answered with as
 * a chart and a table, and its rate and latency over the window.
 */
export const EndpointStats: Story = {
	args: { drawer: 'endpoint-stats' },
};

/**
 * The ten errors the domain returned most, by endpoint, status code and the
 * message that came back. A row opens the traces behind it.
 */
export const TopErrors: Story = {
	args: { drawer: 'top-errors' },
};

/**
 * A domain answering almost every call with an error, which is what the drawer
 * looks like when the host is the problem.
 */
export const FailingDomain: Story = {
	args: { drawer: 'endpoint-stats', drawerDomain: 'failing' },
};

/**
 * Nothing instrumented yet: no client spans carrying a URL, so the page explains
 * what to send instead of listing hosts.
 */
export const NoExternalCalls: Story = {
	args: { domains: 0 },
};

/** The domain list mid-query, with the cancel action the toolbar offers. */
export const Loading: Story = {
	args: { dataState: 'loading' },
};
