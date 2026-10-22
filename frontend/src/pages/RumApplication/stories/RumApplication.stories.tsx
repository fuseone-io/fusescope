import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, screen, userEvent, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import RumApplication from '../index';
import { rumApplicationMocks } from './RumApplication.stories.mocks';

type RumApplicationArgs = PageStoryArgs<typeof rumApplicationMocks>;

const pageStory = storyMocks(rumApplicationMocks, {
	route: ROUTES.RUM_APPLICATION.replace(':id', 'app-web-shop'),
	layout: 'app',
});

const WAIT = { timeout: 10000 };

/**
 * One RUM application: sessions, views and the session error rate, Web Vitals
 * p75 with their good / needs-improvement / poor split, the slowest routes,
 * recent errors with their logs, and recent sessions with the backend trace
 * of their slowest or failing request.
 *
 * Route: `/frontend/applications/:id`.
 */
const meta = {
	title: 'Pages/Frontend/Overview',
	tags: ['beta', 'play'],
	component: RumApplication,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<RumApplicationArgs>;

export default meta;

type Story = StoryObj<RumApplicationArgs>;

/** web-shop with vitals, seven routes, four error groups and six sessions. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findAllByTestId('rum-route-row', {}, WAIT),
		).toHaveLength(7);
		await expect(
			await canvas.findAllByTestId('rum-error-row', {}, WAIT),
		).toHaveLength(4);
		await expect(
			(await canvas.findAllByTestId('rum-session-trace', {}, WAIT))[0],
		).toHaveAttribute('href', expect.stringContaining('/trace/'));
		await expect(canvas.getByTestId('page-tab-sessions')).toBeDisabled();
	},
};

/** The overview in the dark theme. */
export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

/** An application that has sent nothing in the range. */
export const Empty: Story = {
	args: { telemetry: false },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByText('No errors in this range.', {}, WAIT),
		).toBeInTheDocument();
	},
};

/** The settings sheet opened from the header. */
export const Settings: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('rum-overview-settings', {}, WAIT),
		);
		await expect(await screen.findByTestId('rum-app-name', {}, WAIT)).toHaveValue(
			'web-shop',
		);
	},
};
