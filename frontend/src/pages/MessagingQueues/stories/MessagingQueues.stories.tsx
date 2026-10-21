import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import { kafkaOverviewMocks } from './MessagingQueues.stories.mocks';

import MessagingQueuesMainPage from '../MessagingQueuesMainPage';

type KafkaOverviewArgs = PageStoryArgs<typeof kafkaOverviewMocks>;

const pageStory = storyMocks(kafkaOverviewMocks, { layout: 'app' });

/**
 * The Kafka setup page: what each part of the pipeline reports before the detail
 * views have anything to show.
 *
 * Route: `/messaging-queues/kafka`.
 */
const meta = {
	title: 'Pages/Messaging Queues/Kafka',
	tags: ['play'],
	component: MessagingQueuesMainPage,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<KafkaOverviewArgs>;

export default meta;

type Story = StoryObj<KafkaOverviewArgs>;

/** The onboarding checks land after the first render. */
const untilLoaded = { timeout: 15_000 };

/**
 * The kafka landing tab: the setup steps with their progress, then the five
 * views the detail page offers, each saying what it still needs.
 */
export const Default: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);

		await expect(
			await canvas.findByText('3 of 3 done', undefined, untilLoaded),
		).toBeInTheDocument();
		await expect(
			canvas.getByTestId('kafka-view-readiness-consumerLag'),
		).toHaveTextContent('Ready');
		await expect(
			screen.queryByTestId('kafka-health-check-sheet'),
		).not.toBeInTheDocument();
	},
};

/**
 * Incomplete instrumentation: the header button counts what is missing, the
 * checklist opens on its own and each view names what it needs.
 */
export const MissingConfiguration: Story = {
	args: { configuration: 'partial' },
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);

		await expect(
			await canvas.findByTestId(
				'kafka-health-check-missing',
				undefined,
				untilLoaded,
			),
		).toHaveTextContent(/\d+ missing/);
		await screen.findByTestId('kafka-health-check-sheet', undefined, untilLoaded);
		await expect(
			canvas.getByTestId('kafka-view-readiness-consumerLag'),
		).toHaveTextContent('Needs Kafka receiver metrics');
	},
};

/** The checklist behind the header button, narrowed to what is missing. */
export const ConfigurationChecklist: Story = {
	args: { configuration: 'partial' },
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		const sheet = await screen.findByTestId(
			'kafka-health-check-sheet',
			undefined,
			untilLoaded,
		);

		await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
		await waitFor(() =>
			expect(
				screen.queryByTestId('kafka-health-check-sheet'),
			).not.toBeInTheDocument(),
		);

		await userEvent.click(canvas.getByTestId('kafka-health-check-button'));
		const reopened = await screen.findByTestId('kafka-health-check-sheet');
		await userEvent.click(
			within(reopened).getByRole('button', { name: /^Missing/ }),
		);

		await waitFor(() =>
			expect(within(reopened).queryAllByTestId('attribute-found')).toHaveLength(0),
		);
		await expect(
			within(reopened).getAllByTestId('attribute-missing').length,
		).toBeGreaterThan(0);
		await expect(
			within(reopened).getAllByRole('button', { name: /^Fix / }).length,
		).toBeGreaterThan(0);
	},
};
