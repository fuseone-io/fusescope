import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, userEvent, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import RumApplication from '../../index';
import { rumApplicationMocks } from '../../stories/RumApplication.stories.mocks';

type RumSessionTimelineArgs = PageStoryArgs<typeof rumApplicationMocks>;

const pageStory = storyMocks(rumApplicationMocks, {
	route: ROUTES.RUM_APPLICATION_SESSION.replace(':id', 'app-web-shop').replace(
		':sessionId',
		'7f3ac9d04b1e4a6f9e2b5c8d1a07c21e',
	),
	layout: 'app',
});

const WAIT = { timeout: 10000 };

/**
 * One session: a summary, the views along the session with their actions and
 * errors, and each view's requests and events. Requests open their backend
 * trace; errors open the Logs explorer.
 *
 * Route: `/frontend/applications/:id/sessions/:sessionId`.
 */
const meta = {
	title: 'Pages/Frontend/Session timeline',
	tags: ['beta', 'play'],
	component: RumApplication,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<RumSessionTimelineArgs>;

export default meta;

type Story = StoryObj<RumSessionTimelineArgs>;

/** Six views; the cart view with its failed request and error starts open. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findAllByTestId('rum-session-view', {}, WAIT),
		).toHaveLength(6);
		await expect(
			canvas.getByTestId('rum-session-event-error-link'),
		).toHaveAttribute('href', expect.stringContaining('/logs/'));
		await expect(
			canvas.getAllByTestId('rum-session-event-request-link')[0],
		).toHaveTextContent('View backend trace');
		await userEvent.click(canvas.getByTestId('rum-session-expand-all'));
		await userEvent.click(canvas.getByTestId('rum-session-kind-errors'));
		await expect(canvas.getAllByTestId('rum-session-event')).toHaveLength(1);
	},
};

/** The timeline in the dark theme. */
export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

/** A session with more events than one response carries. */
export const Truncated: Story = {
	args: { truncated: true },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-session-truncated', {}, WAIT),
		).toBeInTheDocument();
	},
};

/** Waiting for the session. */
export const Loading: Story = {
	args: { dataState: 'loading' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-session-loading', {}, WAIT),
		).toBeInTheDocument();
	},
};
