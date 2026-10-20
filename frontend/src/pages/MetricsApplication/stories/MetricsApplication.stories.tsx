import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { screen, userEvent, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import MetricsApplication from '../MetricsApplication';
import { metricsApplicationMocks } from './MetricsApplication.stories.mocks';

type MetricsApplicationArgs = PageStoryArgs<typeof metricsApplicationMocks>;

const pageStory = storyMocks(metricsApplicationMocks, { layout: 'app' });

/**
 * One service as an APM overview: KPIs and charts against the previous period,
 * endpoints, dependencies, errors, hosts, DB and external calls.
 *
 * Route: `/services/:servicename`.
 */
const meta = {
	title: 'Pages/Services/Detail',
	tags: ['play'],
	component: MetricsApplication,
	// The page reads the service out of the pathname, so it renders under its own
	// route rather than being mounted on its own.
	render: (): JSX.Element => (
		<Route path={ROUTES.SERVICE_METRICS} component={MetricsApplication} />
	),
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<MetricsApplicationArgs>;

export default meta;

type Story = StoryObj<MetricsApplicationArgs>;

/**
 * A service's overview: KPIs against the previous period, highlights, latency,
 * rate, error % and Apdex with the previous period dashed, the latency
 * distribution, monitors and the top endpoints.
 */
export const Default: Story = {};

/** The overview in the dark theme. */
export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

/** Every operation with rate, latency, error rate and its share of the service's time. */
export const Endpoints: Story = {
	args: { tab: 'ENDPOINTS' },
};

/** Callers and callees of the service, on a map and in two tables. */
export const Dependencies: Story = {
	args: { tab: 'DEPENDENCIES' },
};

/** Error summary, top exceptions and error status messages. */
export const Errors: Story = {
	args: { tab: 'ERRORS' },
};

/** The hosts behind the service's requests. */
export const Infrastructure: Story = {
	args: { tab: 'INFRASTRUCTURE' },
};

/** The database calls the service makes, by system and by upstream. */
export const DatabaseCalls: Story = {
	args: { tab: 'DB_CALL_METRICS' },
};

/** The calls the service makes out of the mesh, by address. */
export const ExternalCalls: Story = {
	args: { tab: 'EXTERNAL_METRICS' },
};

/** Every available operation and graph series, for the page's densest layout. */
export const DenseOperations: Story = {
	args: { operations: 10, series: 6 },
};

/** The endpoints table when this service has no top or entry-point operations. */
export const NoOperations: Story = {
	args: { operations: 0, tab: 'ENDPOINTS' },
};

/**
 * The Download menu on the top operations table, open: the formats the rows can
 * be taken away in.
 */
export const DownloadMenu: Story = {
	args: { tab: 'ENDPOINTS' },
	play: async ({ canvasElement }): Promise<void> => {
		await userEvent.click(
			await within(canvasElement).findByTestId(
				'download-menu-trigger',
				{},
				{ timeout: 15000 },
			),
		);
		await screen.findByRole('menu');
	},
};
