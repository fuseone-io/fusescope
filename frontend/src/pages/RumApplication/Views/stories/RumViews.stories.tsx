import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import RumApplication from '../../index';
import { rumApplicationMocks } from '../../stories/RumApplication.stories.mocks';

type RumViewsArgs = PageStoryArgs<typeof rumApplicationMocks>;

const VIEWS = ROUTES.RUM_APPLICATION_VIEWS.replace(':id', 'app-web-shop');

const pageStory = storyMocks(rumApplicationMocks, {
	route: VIEWS,
	layout: 'app',
});

const WAIT = { timeout: 10000 };

/**
 * A RUM application's routes: page loads and route changes, LCP / INP / CLS
 * p75 with their good / needs-improvement / poor split, time on view, errors
 * and the slowest request. A route opens a sheet with its vitals over time,
 * slowest requests and their traces, browsers and OS, and recent sessions.
 *
 * Route: `/frontend/applications/:id/views?route=`.
 */
const meta = {
	title: 'Pages/Frontend/Views',
	tags: ['beta', 'play'],
	component: RumApplication,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<RumViewsArgs>;

export default meta;

type Story = StoryObj<RumViewsArgs>;

/** Seven routes, slowest LCP first; sorting by errors flips the order. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const routes = await canvas.findAllByTestId('rum-views-open', {}, WAIT);
		await expect(routes).toHaveLength(7);
		await expect(routes[0]).toHaveTextContent('/product/:id');
		await userEvent.click(canvas.getByTestId('rum-views-sort-route'));
		await expect(
			(await canvas.findAllByTestId('rum-views-open'))[0],
		).toHaveTextContent('/');
	},
};

/** The routes in the dark theme. */
export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

/** Views from SDKs before 0.2.0 are not split into page loads and route changes. */
export const OldSdk: Story = {
	args: { oldSdk: true },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-views-unknown-loads', {}, WAIT),
		).toHaveTextContent('0.2.0');
	},
};

/** /product/:id opened: vitals with release markers, traces, clients, sessions. */
export const RouteSheet: Story = {
	parameters: {
		signoz: {
			route: `${VIEWS}?relativeTime=1d&route=${encodeURIComponent('/product/:id')}`,
		},
	},
	play: async () => {
		const sheet = await screen.findByTestId('rum-route-sheet', {}, WAIT);
		const body = within(sheet);
		await expect(
			(await body.findAllByTestId('rum-route-request-trace', {}, WAIT))[0],
		).toHaveAttribute('href', expect.stringContaining('/trace/'));
		await expect(body.getAllByTestId('rum-route-release-marker')).toHaveLength(1);
		await waitFor(() =>
			expect(body.getByTestId('rum-route-create-alert')).toHaveAttribute(
				'href',
				expect.stringContaining('rumTemplate=lcp_p75'),
			),
		);
		await userEvent.click(body.getByTestId('rum-route-vital-inp'));
		await expect(body.getByTestId('rum-route-vital-inp')).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		await expect(
			body.getAllByTestId('rum-route-session-open')[0],
		).toHaveAttribute('href', expect.stringContaining('/sessions/'));
	},
};

/** The route sheet in the dark theme. */
export const RouteSheetDark: Story = {
	parameters: {
		signoz: {
			theme: 'dark',
			route: `${VIEWS}?relativeTime=1d&route=${encodeURIComponent('/product/:id')}`,
		},
	},
};

/** No views in the range. */
export const Empty: Story = {
	args: { telemetry: false },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByText('No views in this range.', {}, WAIT),
		).toBeInTheDocument();
	},
};

/** Waiting for the routes. */
export const Loading: Story = {
	args: { dataState: 'loading' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByText('Loading routes…', {}, WAIT),
		).toBeInTheDocument();
	},
};
