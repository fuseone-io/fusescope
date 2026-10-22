import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import RumApplications from '../index';
import { rumApplicationsMocks } from './RumApplications.stories.mocks';

type RumApplicationsArgs = PageStoryArgs<typeof rumApplicationsMocks>;

const pageStory = storyMocks(rumApplicationsMocks, {
	route: ROUTES.RUM_APPLICATIONS,
	layout: 'app',
});

const WAIT = { timeout: 10000 };

/**
 * Real User Monitoring applications: sessions, the share of sessions with an
 * error and Web Vitals p75 per application in the selected range, with the
 * setup sheet that creates them, holds their keys and the install snippet.
 * Creating and editing follow the legacy admin and editor roles.
 *
 * Route: `/frontend/applications`.
 */
const meta = {
	title: 'Pages/Frontend/Applications',
	tags: ['role-gated', 'beta', 'play'],
	component: RumApplications,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<RumApplicationsArgs>;

export default meta;

type Story = StoryObj<RumApplicationsArgs>;

/** Three applications with sessions, error rates, vitals and SDK versions. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findAllByTestId('rum-application-row', {}, WAIT),
		).toHaveLength(3);
		await waitFor(
			() =>
				expect(canvas.getByTestId('rum-kpi-outdated')).toHaveTextContent(
					'admin-portal',
				),
			WAIT,
		);
	},
};

/** The default list in the dark theme. */
export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

/** No application yet: what RUM does, the three steps and the platforms. */
export const Empty: Story = {
	args: { applications: 0 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-applications-empty', {}, WAIT),
		).toHaveTextContent('See what your users experience');
		await expect(canvas.getByTestId('rum-empty-create')).toBeVisible();
	},
};

/** A viewer reads the list but cannot create applications. */
export const Viewer: Story = {
	args: { access: 'viewer' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findAllByTestId('rum-application-row', {}, WAIT),
		).toHaveLength(3);
		await expect(canvas.getByTestId('rum-applications-count')).toHaveTextContent(
			'3 applications',
		);
		await expect(canvas.queryByTestId('rum-applications-new')).toBeNull();
		await expect(canvas.queryByTestId('rum-applications-unavailable')).toBeNull();
	},
};

/** One application: its counts read in the singular. */
export const SingleApplication: Story = {
	args: { applications: 1 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findAllByTestId('rum-application-row', {}, WAIT),
		).toHaveLength(1);
		await expect(canvas.getByTestId('rum-applications-shown')).toHaveTextContent(
			'1 of 1 application',
		);
		await expect(canvas.getByTestId('rum-applications-count')).toHaveTextContent(
			/^1 application ·/,
		);
	},
};

/** The search narrows the table to the matching application. */
export const Search: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await canvas.findAllByTestId('rum-application-row', {}, WAIT);
		await userEvent.type(canvas.getByTestId('rum-applications-search'), 'check');
		await expect(canvas.getAllByTestId('rum-application-row')).toHaveLength(1);
		await expect(canvas.getByTestId('rum-platform-ios')).toBeDisabled();
	},
};

/** The new-application sheet on its settings step; the install step waits for it. */
export const NewApplication: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('rum-applications-new', {}, WAIT),
		);
		await screen.findByTestId('rum-app-settings', {}, WAIT);
		await expect(screen.getByTestId('rum-sheet-tab-install')).toBeDisabled();
	},
};

/**
 * Right after creating: the key shown once, the snippet built from the
 * settings, and the setup status waiting with a refused origin and an unknown key.
 */
export const KeyShownOnce: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('rum-applications-new', {}, WAIT),
		);
		await userEvent.type(
			await screen.findByTestId('rum-app-name', {}, WAIT),
			'web-shop-next',
		);
		await userEvent.type(
			screen.getByTestId('rum-app-origins-input'),
			'https://next.shop.example.com{Enter}',
		);
		await userEvent.click(screen.getByTestId('rum-app-submit'));
		await expect(
			await screen.findByTestId('rum-key-value', {}, WAIT),
		).toHaveTextContent('rum_pub_k7q2m4xzan6cw5rthfyp3jav4dlb6eqs');
		await expect(screen.getByTestId('rum-install-snippet')).toHaveTextContent(
			"publicKey: 'rum_pub_k7q2m4xzan6cw5rthfyp3jav4dlb6eqs'",
		);
		await expect(screen.getByTestId('rum-install-snippet')).toHaveTextContent(
			"version: '<your app version>'",
		);
		const rejections = await screen.findAllByTestId('rum-rejection', {}, WAIT);
		await expect(rejections[0]).toHaveTextContent('http://localhost:5173');
		await expect(rejections[1]).toHaveTextContent(
			'5 requests with an unknown key from https://shop.example.com',
		);
	},
};

/** The install step once the first data arrived: counts and the SDK seen. */
export const Receiving: Story = {
	args: { setupStatus: 'receiving' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			(await canvas.findAllByTestId('rum-application-settings', {}, WAIT))[0],
		);
		await userEvent.click(
			await screen.findByTestId('rum-sheet-tab-install', {}, WAIT),
		);
		await expect(
			await screen.findByText('Receiving data', {}, WAIT),
		).toBeInTheDocument();
	},
};

/** An application's public key tab, with the rotate dialog and its overlap window. */
export const RotateKey: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			(await canvas.findAllByTestId('rum-application-settings', {}, WAIT))[0],
		);
		await userEvent.click(
			await screen.findByTestId('rum-sheet-tab-key', {}, WAIT),
		);
		await userEvent.click(await screen.findByTestId('rum-key-rotate', {}, WAIT));
		await userEvent.click(await screen.findByTestId('rum-overlap-7d', {}, WAIT));
		await userEvent.click(screen.getByTestId('rum-rotate-confirm'));
		await expect(
			await screen.findByTestId('rum-key-value', {}, WAIT),
		).toHaveTextContent('rum_pub_qm2vx3lkt4nrw6ybzq7pd5hej2ca4fgu');
	},
};

/** A rotation under way: the expiring key can be revoked, rotating again cannot start. */
export const Rotating: Story = {
	args: { rotating: true },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			(await canvas.findAllByTestId('rum-application-settings', {}, WAIT))[0],
		);
		await userEvent.click(
			await screen.findByTestId('rum-sheet-tab-key', {}, WAIT),
		);
		await expect(
			await screen.findByTestId('rum-key-rotate', {}, WAIT),
		).toBeDisabled();
		await expect(screen.getAllByTestId('rum-key-row')).toHaveLength(2);
	},
};

/** A viewer opens an application's settings read-only. */
export const ViewerSettings: Story = {
	args: { access: 'viewer' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			(await canvas.findAllByTestId('rum-application-settings', {}, WAIT))[0],
		);
		await expect(
			await screen.findByTestId('rum-app-name', {}, WAIT),
		).toBeDisabled();
		await expect(screen.queryByTestId('rum-app-submit')).toBeNull();
		await expect(screen.queryByTestId('rum-app-delete')).toBeNull();
	},
};

/** A viewer's public key tab: no keys, no actions, who manages them instead. */
export const ViewerKeys: Story = {
	args: { access: 'viewer' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			(await canvas.findAllByTestId('rum-application-settings', {}, WAIT))[0],
		);
		await userEvent.click(
			await screen.findByTestId('rum-sheet-tab-key', {}, WAIT),
		);
		await expect(
			await screen.findByTestId('rum-keys-managed', {}, WAIT),
		).toHaveTextContent('Keys are managed by admins and editors');
		await expect(screen.queryByTestId('rum-key-row')).toBeNull();
		await expect(screen.queryByTestId('rum-key-rotate')).toBeNull();
	},
};
