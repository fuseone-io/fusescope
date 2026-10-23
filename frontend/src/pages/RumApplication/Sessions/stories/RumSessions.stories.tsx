import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, userEvent, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import RumApplication from '../../index';
import { rumApplicationMocks } from '../../stories/RumApplication.stories.mocks';

type RumSessionsArgs = PageStoryArgs<typeof rumApplicationMocks>;

const SESSIONS = ROUTES.RUM_APPLICATION_SESSIONS.replace(':id', 'app-web-shop');

const pageStory = storyMocks(rumApplicationMocks, {
	route: SESSIONS,
	layout: 'app',
});

const WAIT = { timeout: 10000 };

/**
 * A RUM application's sessions, newest first, filtered by release, browser,
 * route, duration, user and errors, all kept in the URL. A session opens its
 * timeline.
 *
 * Route: `/frontend/applications/:id/sessions`.
 */
const meta = {
	title: 'Pages/Frontend/Sessions',
	tags: ['beta', 'play'],
	component: RumApplication,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<RumSessionsArgs>;

export default meta;

type Story = StoryObj<RumSessionsArgs>;

/** Eight sessions; "Has error" keeps the four with an error. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findAllByTestId('rum-sessions-row', {}, WAIT),
		).toHaveLength(8);
		await expect(canvas.getAllByTestId('rum-sessions-open')[0]).toHaveAttribute(
			'href',
			expect.stringContaining('/sessions/7f3ac9d04b1e4a6f9e2b5c8d1a07c21e'),
		);
		await userEvent.click(canvas.getByTestId('rum-sessions-has-error'));
		await expect(
			await canvas.findByText('4 sessions · newest first', {}, WAIT),
		).toBeInTheDocument();
	},
};

/** The sessions in the dark theme. */
export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

/** Filters read from the URL. */
export const Filtered: Story = {
	parameters: {
		signoz: {
			route: `${SESSIONS}?browser=Safari&minDuration=60000&hasError=true`,
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-sessions-browser', {}, WAIT),
		).toHaveValue('Safari');
		await expect(canvas.getByTestId('rum-sessions-duration')).toHaveValue(
			'gte1m',
		);
		await expect(canvas.getByTestId('rum-sessions-has-error')).toBeChecked();
	},
};

/** No sessions in the range. */
export const Empty: Story = {
	args: { telemetry: false },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-sessions-empty', {}, WAIT),
		).toBeInTheDocument();
	},
};

/** Waiting for the sessions. */
export const Loading: Story = {
	args: { dataState: 'loading' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByText('Loading sessions…', {}, WAIT),
		).toBeInTheDocument();
	},
};
