import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { expect, userEvent, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import { onboardingMocks } from '../../stories/onboardingStoryMocks';
import Guide from '../index';

type GuideArgs = PageStoryArgs<typeof onboardingMocks>;

const pageStory = storyMocks(onboardingMocks, {
	route: '/get-started/nodejs',
	layout: 'app',
});

const untilLoaded = { timeout: 15_000 };

const startApp = async (canvasElement: HTMLElement): Promise<void> => {
	await userEvent.click(
		await within(canvasElement).findByTestId(
			'guide-start',
			undefined,
			untilLoaded,
		),
	);
};

/**
 * An in-app setup guide: name the service, install, configure and run with
 * snippets that follow the inputs, then wait for the service's first data.
 *
 * Route: `/get-started/:guideId`.
 */
const meta = {
	title: 'Pages/Get Started/Guide',
	tags: ['play'],
	component: Guide,
	render: (): JSX.Element => (
		<Route path={ROUTES.GET_STARTED_GUIDE} component={Guide} />
	),
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<GuideArgs>;

export default meta;

type Story = StoryObj<GuideArgs>;

/** Before the app starts: steps and snippets, nothing polled yet. */
export const Default: Story = {};

/** Polling every 5 s for the service, with what to check meanwhile. */
export const Waiting: Story = {
	args: { receiving: false },
	play: async ({ canvasElement }): Promise<void> => {
		await startApp(canvasElement);
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByTestId('guide-waiting', undefined, untilLoaded),
		).toHaveTextContent('Waiting for data from my-service');
	},
};

/** The first data arrived: counts and where to look next. */
export const Receiving: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await startApp(canvasElement);
		const canvas = within(canvasElement);
		await canvas.findByTestId('guide-receiving', undefined, untilLoaded);
		await expect(canvas.getByTestId('guide-open-service')).toHaveAttribute(
			'href',
			'/services/my-service',
		);
	},
};

/** The Kubernetes tab through a collector in the cluster. */
export const KubernetesLocalCollector: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId('guide-runtime-k8s', undefined, untilLoaded),
		);
		await userEvent.click(canvas.getByTestId('guide-route-local'));
		await expect(canvas.getByTestId('guide-run-snippet-k8s')).toHaveTextContent(
			'fusescope-otel-collector.fusescope.svc.cluster.local:4318',
		);
	},
};
