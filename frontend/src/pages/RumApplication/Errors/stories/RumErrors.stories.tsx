import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, screen, userEvent, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';
import { HTTP_ERROR } from '@/storybook/msw/__story_mockdata__/rumErrors';

import RumApplication from '../../index';
import { rumApplicationMocks } from '../../stories/RumApplication.stories.mocks';

type RumErrorsArgs = PageStoryArgs<typeof rumApplicationMocks>;

const ERRORS = ROUTES.RUM_APPLICATION_ERRORS.replace(':id', 'app-web-shop');
const DETAIL = `${ERRORS}/${HTTP_ERROR}`;

const pageStory = storyMocks(rumApplicationMocks, {
	route: ERRORS,
	layout: 'app',
});

const WAIT = { timeout: 10000 };

/**
 * A RUM application's errors grouped by fingerprint, filtered by release,
 * search and source in the URL. A group opens its detail: the stack
 * symbolicated through uploaded source maps, breadcrumbs, the failed request
 * before it and the sessions it hit.
 *
 * Routes: `/frontend/applications/:id/errors` and `…/errors/:fingerprint`.
 */
const meta = {
	title: 'Pages/Frontend/Errors',
	tags: ['beta', 'play'],
	component: RumApplication,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<RumErrorsArgs>;

export default meta;

type Story = StoryObj<RumErrorsArgs>;

/** Six groups; the oldest release's group has no source maps. */
export const List: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findAllByTestId('rum-error-group', {}, WAIT),
		).toHaveLength(6);
		await expect(
			await canvas.findByTestId('rum-error-group-no-map', {}, WAIT),
		).toBeInTheDocument();
		await expect(
			canvas.getAllByTestId('rum-error-group-open')[2],
		).toHaveAttribute('href', expect.stringContaining(`/errors/${HTTP_ERROR}`));
	},
};

/** The list in the dark theme. */
export const ListDark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

/** Filters read from the URL. */
export const Filtered: Story = {
	parameters: { signoz: { route: `${ERRORS}?source=unhandledrejection` } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findAllByTestId('rum-error-group', {}, WAIT),
		).toHaveLength(1);
		await expect(
			canvas.getByTestId('rum-errors-source-unhandledrejection'),
		).toHaveAttribute('aria-pressed', 'true');
	},
};

/** No errors in the range. */
export const Empty: Story = {
	args: { telemetry: false },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-errors-empty', {}, WAIT),
		).toHaveTextContent('No errors in this range.');
	},
};

/**
 * The HttpError group, symbolicated: app frames with source, library frames
 * folded, and React's component stack.
 */
export const Detail: Story = {
	parameters: { signoz: { route: DETAIL } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-error-symbolicated', {}, WAIT),
		).toBeInTheDocument();
		const original = canvas.getByRole('list', { name: 'Original stack trace' });
		await expect(within(original).getAllByTestId('rum-error-frame')).toHaveLength(
			3,
		);
		await expect(canvas.getByTestId('rum-error-frame-context')).toHaveTextContent(
			'throw new HttpError',
		);
		const components = canvas.getByRole('list', { name: 'Component stack' });
		await expect(
			within(components).getAllByTestId('rum-error-frame'),
		).toHaveLength(3);
		await expect(canvas.getAllByTestId('rum-error-breadcrumb')).toHaveLength(8);
		await expect(canvas.getByTestId('rum-error-request-trace')).toHaveAttribute(
			'href',
			expect.stringContaining('/trace/'),
		);
	},
};

/** The detail in the dark theme. */
export const DetailDark: Story = {
	parameters: { signoz: { route: DETAIL, theme: 'dark' } },
};

/** The same stack as the browser sent it. */
export const Minified: Story = {
	parameters: { signoz: { route: DETAIL } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('rum-error-mode-minified', {}, WAIT),
		);
		await expect(canvas.getByTestId('rum-error-minified')).toHaveTextContent(
			'cart.9b1e07.js:1:3381',
		);
	},
};

/** The release has no source maps: the upload command for it. */
export const SourceMapMissing: Story = {
	args: { sourceMapMissing: true },
	parameters: { signoz: { route: DETAIL } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('rum-error-upload-command', {}, WAIT),
		).toHaveTextContent('sourcemaps upload dist --release 1.8.0');
		await expect(canvas.getByTestId('rum-error-mode-original')).toBeDisabled();
		await userEvent.click(canvas.getByTestId('rum-error-open-sourcemaps'));
		await expect(
			await screen.findByTestId('rum-app-sourcemaps', {}, WAIT),
		).toBeInTheDocument();
	},
};

/** The Source maps tab of the settings sheet, with four releases. */
export const SourceMaps: Story = {
	parameters: { signoz: { route: DETAIL } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('rum-overview-settings', {}, WAIT),
		);
		await userEvent.click(
			await screen.findByTestId('rum-sheet-tab-sourcemaps', {}, WAIT),
		);
		const releases = await screen.findAllByTestId(
			'rum-sourcemaps-release',
			{},
			WAIT,
		);
		await expect(releases).toHaveLength(4);
		await userEvent.click(
			within(releases[0]).getByTestId('rum-sourcemaps-expand'),
		);
		await expect(
			await within(releases[0]).findAllByTestId('rum-sourcemaps-file', {}, WAIT),
		).toHaveLength(4);
		await expect(screen.getByTestId('rum-sourcemaps-drop')).toBeInTheDocument();
	},
};

/** Nothing uploaded yet. */
export const SourceMapsEmpty: Story = {
	args: { noSourceMaps: true },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('rum-overview-settings', {}, WAIT),
		);
		await userEvent.click(
			await screen.findByTestId('rum-sheet-tab-sourcemaps', {}, WAIT),
		);
		await expect(
			await screen.findByTestId('rum-sourcemaps-empty', {}, WAIT),
		).toBeInTheDocument();
	},
};

/** A viewer lists the uploads but cannot upload, delete or change retention. */
export const SourceMapsViewer: Story = {
	args: { access: 'viewer' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('rum-overview-settings', {}, WAIT),
		);
		await userEvent.click(
			await screen.findByTestId('rum-sheet-tab-sourcemaps', {}, WAIT),
		);
		await expect(
			await screen.findAllByTestId('rum-sourcemaps-release', {}, WAIT),
		).toHaveLength(4);
		await expect(
			screen.queryByTestId('rum-sourcemaps-release-delete'),
		).toBeNull();
		await expect(screen.queryByTestId('rum-sourcemaps-drop')).toBeNull();
		await expect(
			screen.getByTestId('rum-sourcemaps-readonly'),
		).toBeInTheDocument();
	},
};
