import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import LLMObservabilityPage from '../../index';
import {
	attributeMappingMocks,
	wideConditionGroup,
} from './AttributeMapping.stories.mocks';
import { spanMappersHandler } from './__story_mockdata__/spanMappers';

type AttributeMappingArgs = PageStoryArgs<typeof attributeMappingMocks>;

const pageStory = storyMocks(attributeMappingMocks, { layout: 'app' });

/**
 * Mapping groups that tell FuseScope which span attributes carry LLM data, and the
 * tab that tests a mapping against a sample span. Managing a group is gated on an
 * authz permission rather than a role.
 *
 * Route: `/ai-observability/attribute-mapping`.
 */
const meta = {
	title: 'Pages/AI Observability/Attribute Mapping',
	tags: ['authz', 'play'],
	component: LLMObservabilityPage,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<AttributeMappingArgs>;

export default meta;

type Story = StoryObj<AttributeMappingArgs>;

/**
 * The rules that bring another SDK's span attributes onto the `gen_ai.*` names
 * the rest of AI observability reads.
 */
export const Default: Story = {};

/** No mapping set up yet, which is what a workspace on plain OTel stays on. */
export const NoGroups: Story = {
	args: { groups: 0 },
};

/**
 * The conditions tooltip on every group header, held open: what a span has to
 * carry for the group to run. The first group matches on far more keys than the
 * tab's own fixture, so the Mapping groups control does not reach this story.
 */
export const Tooltips: Story = {
	args: { tooltipsOpen: true },
	parameters: { msw: { handlers: [wideConditionGroup] } },
};

/**
 * The first mapping group's own menu, open: edit the group, clone it, delete it.
 */
export const GroupActionsMenu: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const [first] = await within(canvasElement).findAllByRole(
			'button',
			{ name: 'Group actions' },
			{ timeout: 10000 },
		);

		await userEvent.click(first);
		await screen.findByRole('menu');
	},
};

/** The first mapping group's edit drawer, opened from its menu. */
export const GroupFormDrawer: Story = {
	play: async (context): Promise<void> => {
		await GroupActionsMenu.play?.(context);
		await userEvent.click(await screen.findByText('Edit'));
		await screen.findByText('Edit group');
	},
};

/**
 * A group toggled off and saved: the toast announcing the saved changes, raised
 * once the PATCH and the list refetch answer. Set Save changes to `error`,
 * `refreshFailed` or `loading` for the other outcomes.
 */
export const ChangesSavedToast: Story = {
	play: async ({ canvasElement, args }): Promise<void> => {
		const [toggle] = await within(canvasElement).findAllByTestId(
			/^group-enabled-/,
			{},
			{ timeout: 10000 },
		);

		await userEvent.click(toggle);
		await userEvent.click(await screen.findByTestId('save-changes-btn'));
		if (args.groupsSave === 'success') {
			await waitFor(() =>
				expect(screen.getByText(/attribute mapping changes saved/i)).toBeVisible(),
			);
		}
	},
};

const expandFirstGroup = async (canvasElement: HTMLElement): Promise<void> => {
	const [toggle] = await within(canvasElement).findAllByTestId(
		/^group-expand-/,
		{},
		{ timeout: 10000 },
	);

	await userEvent.click(toggle);
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await within(canvasElement).findAllByTestId(
		/^mapper-row-/,
		{},
		{ timeout: 10000 },
	);
};

/** The first group open: its mappings, each with the sources tried in order. */
export const GroupExpanded: Story = {
	parameters: { msw: { handlers: [spanMappersHandler] } },
	play: async ({ canvasElement }): Promise<void> => {
		await expandFirstGroup(canvasElement);
	},
};

/**
 * A mapping switched off in the open group: the unsaved-changes bar names what
 * is staged and offers Discard and Save changes.
 */
export const UnsavedChanges: Story = {
	parameters: { msw: { handlers: [spanMappersHandler] } },
	play: async ({ canvasElement }): Promise<void> => {
		await expandFirstGroup(canvasElement);
		const [toggle] =
			await within(canvasElement).findAllByTestId(/^mapper-enabled-/);

		await userEvent.click(toggle);
		const bar = await within(canvasElement).findByTestId('unsaved-changes');
		await expect(bar).toHaveTextContent(
			'1 mapping changed in LangChain callbacks',
		);
	},
};

/** The Test tab: the sample span editor beside the attributes it would produce. */
export const TestWithSpan: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await userEvent.click(
			await within(canvasElement).findByRole(
				'tab',
				{ name: 'Test' },
				{ timeout: 10000 },
			),
		);
		await within(canvasElement).findByTestId('test-results-placeholder');
	},
};
