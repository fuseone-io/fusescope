import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import GetStarted from '../index';
import { onboardingMocks } from './onboardingStoryMocks';

type GetStartedArgs = PageStoryArgs<typeof onboardingMocks>;

const pageStory = storyMocks(onboardingMocks, {
	route: ROUTES.GET_STARTED,
	layout: 'app',
});

const untilLoaded = { timeout: 15_000 };

/**
 * The data source catalog: where to send OTLP, whether anything arrived, then
 * every source by goal, each opening an in-app guide, an in-app page or the
 * docs.
 *
 * Route: `/get-started`.
 */
const meta = {
	title: 'Pages/Get Started/Catalog',
	tags: ['role-gated', 'play'],
	component: GetStarted,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<GetStartedArgs>;

export default meta;

type Story = StoryObj<GetStartedArgs>;

/** A workspace already receiving every signal, with Redis sending data. */
export const Default: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await waitFor(
			() =>
				expect(canvas.getByTestId('signal-status-traces')).toHaveAttribute(
					'data-received',
					'true',
				),
			untilLoaded,
		);
		await expect(canvas.getByTestId('catalog-entry-nodejs')).toHaveAttribute(
			'href',
			'/get-started/nodejs',
		);
		await waitFor(
			() =>
				expect(canvas.getByTestId('catalog-entry-redis')).toHaveTextContent(
					'Receiving',
				),
			untilLoaded,
		);
	},
};

/** A brand-new install: derived endpoints and no signal yet. */
export const FreshInstall: Story = {
	args: { receiving: false, ingestionSource: 'derived' },
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await canvas.findByTestId('ingestion-derived', undefined, untilLoaded);
		await waitFor(
			() =>
				expect(canvas.getByTestId('signal-status-logs')).toHaveAttribute(
					'data-received',
					'false',
				),
			untilLoaded,
		);
	},
};

/** Searching narrows the catalog to the matching cards. */
export const Search: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await userEvent.type(
			await canvas.findByTestId('catalog-search', undefined, untilLoaded),
			'syslog',
		);
		await expect(canvas.getByTestId('catalog-search')).toHaveValue('syslog');
		await canvas.findByTestId('catalog-entry-syslog', undefined, untilLoaded);
		await waitFor(() =>
			expect(canvas.queryByTestId('catalog-section-apps')).not.toBeInTheDocument(),
		);
	},
};

/** No card matches: the OTLP fallback and a way back. */
export const NoMatches: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await userEvent.type(
			await canvas.findByTestId('catalog-search', undefined, untilLoaded),
			'cobol',
		);
		await canvas.findByTestId('catalog-no-matches');
	},
};

/** An admin sets the URL apps send to, in place. */
export const AdminEditsEndpoint: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('ingestion-edit', undefined, untilLoaded),
		);
		await expect(canvas.getByTestId('ingestion-url-input')).toHaveValue(
			'http://fusescope.example.com:4318',
		);
	},
};

/** Viewers read the endpoints but cannot change them. */
export const ViewerAccess: Story = {
	args: { access: 'viewer' },
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await waitFor(
			() =>
				expect(canvas.getByTestId('ingestion-endpoint-http')).toHaveTextContent(
					'http://fusescope.example.com:4318',
				),
			untilLoaded,
		);
		await expect(canvas.queryByTestId('ingestion-edit')).not.toBeInTheDocument();
	},
};
