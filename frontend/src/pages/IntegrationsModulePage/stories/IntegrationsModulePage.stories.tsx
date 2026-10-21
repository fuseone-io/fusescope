import type { Meta, StoryObj } from '@storybook/react-vite';
import {
	expect,
	screen,
	spyOn,
	userEvent,
	waitFor,
	within,
} from 'storybook/test';
import ROUTES from 'constants/routes';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import { integrationsMocks } from './IntegrationsModulePage.stories.mocks';
import IntegrationsModulePage from '../IntegrationsModulePage';

type IntegrationsArgs = PageStoryArgs<typeof integrationsMocks>;

const pageStory = storyMocks(integrationsMocks, {
	route: ROUTES.INTEGRATIONS,
	layout: 'app',
});

/**
 * The integrations catalogue, installed ones first.
 *
 * Route: `/integrations`.
 */
const meta = {
	title: 'Pages/Integrations/List',
	tags: ['play'],
	component: IntegrationsModulePage,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<IntegrationsArgs>;

export default meta;

type Story = StoryObj<IntegrationsArgs>;

/** The list fetches before it renders a row, which outlasts the 1s default. */
const untilLoaded = { timeout: 15_000 };

const search = async (
	canvasElement: HTMLElement,
	query: string,
): Promise<void> => {
	const input = await within(canvasElement).findByPlaceholderText(
		/search for an integration/i,
		undefined,
		untilLoaded,
	);

	await userEvent.type(input, query);
};

/**
 * The integrations a workspace can install: the three cloud providers FuseScope
 * sets up in one click, then every built-in integration with who published it
 * and whether it is installed.
 */
export const Default: Story = {};

/**
 * A search that matches nothing, which both sections answer for themselves.
 * The search filters what is already loaded, so no request goes out for it.
 */
export const NoSearchMatches: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await search(canvasElement, 'kafka');
		await within(canvasElement).findAllByText(/no integrations found/i);
	},
};

/**
 * The form for an integration FuseScope does not publish yet. Submitting it
 * opens a prefilled issue on the FuseScope GitHub repository.
 */
export const RequestIntegration: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await userEvent.click(
			await within(canvasElement).findByTestId(
				'integrations-request-button',
				undefined,
				untilLoaded,
			),
		);
		await userEvent.type(
			await screen.findByPlaceholderText(/enter integration name/i),
			'Kafka',
		);
	},
};

/** Submitting the request opens the GitHub issue and closes the form. */
export const RequestIntegrationIssue: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const open = spyOn(window, 'open').mockImplementation(() => null);
		await userEvent.click(
			await within(canvasElement).findByTestId(
				'integrations-request-button',
				undefined,
				untilLoaded,
			),
		);
		await userEvent.type(
			await screen.findByPlaceholderText(/enter integration name/i),
			'Kafka',
		);
		await userEvent.click(
			await screen.findByRole('button', { name: /open github issue/i }),
		);
		await waitFor(() =>
			expect(open).toHaveBeenCalledWith(
				expect.stringContaining('/issues/new?template=request_integration.md'),
				'_blank',
			),
		);
		open.mockRestore();
	},
};
