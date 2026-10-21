import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import {
	OPEN_LISTBOX,
	openAttributeFilterOn,
	openSelect,
	pickOption,
	serviceMapMocks,
	stageClusterIn,
} from './ServiceMap.stories.mocks';

import ServiceMap from '../index';

type ServiceMapArgs = PageStoryArgs<typeof serviceMapMocks>;

const pageStory = storyMocks(serviceMapMocks, { layout: 'app' });

/**
 * Calls between services as a layered graph over `/api/v1/dependency_graph`,
 * with inferred dependencies (db.system, peer.service, external addresses),
 * the map's KPIs, a rule-based root cause, the selected node's details and
 * every caller → callee pair.
 *
 * Route: `/service-map`.
 */
const meta = {
	title: 'Pages/Services/Service Map',
	tags: ['beta', 'play'],
	component: ServiceMap,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<ServiceMapArgs>;

export default meta;

type Story = StoryObj<ServiceMapArgs>;

/** The keys are only fetched once the select opens, past the 1s default. */
const untilLoaded = { timeout: 15_000 };

const nodeButton = async (
	canvasElement: HTMLElement,
	id: string,
): Promise<HTMLElement> =>
	waitFor(() => {
		const node = canvasElement.querySelector<HTMLElement>(
			`[data-node-id="${id}"]`,
		);
		if (!node) {
			throw new Error(`node ${id} not drawn`);
		}
		return node;
	}, untilLoaded);

/**
 * The whole topology: entry points left, dependencies right, each node ringed
 * by its health, and the failing `payments` named as the root cause.
 */
export const Default: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await canvas.findByTestId('service-map-root-cause', undefined, untilLoaded);
		await waitFor(
			() =>
				expect(canvas.getAllByTestId('service-map-node').length).toBeGreaterThan(5),
			untilLoaded,
		);
	},
};

/** A service selected: its KPIs, latency, callers, calls and operations. */
export const SelectedService: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await userEvent.click(await nodeButton(canvasElement, 'checkout'));
		await waitFor(
			() =>
				expect(canvas.getByTestId('service-map-node-name')).toHaveTextContent(
					'checkout',
				),
			untilLoaded,
		);
		await canvas.findByTestId('service-map-node-calls');
	},
};

/** A database without an SDK, inferred from its callers' spans. */
export const SelectedDependency: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await userEvent.click(await nodeButton(canvasElement, 'mysql'));
		await canvas.findByTestId(
			'service-map-inferred-note',
			undefined,
			untilLoaded,
		);
	},
};

/** Nodes coloured by p99 instead of health. */
export const ColorByLatency: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByTestId(
				'service-map-color-latency',
				undefined,
				untilLoaded,
			),
		);
		await canvas.findByText('p99 ≥ 2 s');
	},
};

/** Databases, caches, queues and externals hidden. */
export const DependenciesHidden: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		await nodeButton(canvasElement, 'mysql');
		await userEvent.click(canvas.getByTestId('service-map-dependencies-toggle'));
		await waitFor(() =>
			expect(canvasElement.querySelector('[data-node-id="mysql"]')).toBeNull(),
		);
	},
};

/** The dependency graph request failing. */
export const LoadError: Story = {
	args: { graphFails: true },
	parameters: { allowConsoleErrors: true },
	play: async ({ canvasElement }): Promise<void> => {
		await within(canvasElement).findByTestId(
			'service-map-error',
			undefined,
			untilLoaded,
		);
	},
};

/** A topology without errors: no root-cause banner. */
export const HealthyTopology: Story = {
	args: { health: 'healthy' },
	play: async ({ canvasElement }): Promise<void> => {
		await nodeButton(canvasElement, 'frontend');
		await expect(
			within(canvasElement).queryByTestId('service-map-root-cause'),
		).toBeNull();
	},
};

/**
 * The map narrowed to one environment and one cluster: the environment selector
 * carries the first, a chip carries the second, and the graph is what is left.
 */
export const Filtered: Story = {
	args: { filters: ['environment', 'cluster'] },
};

/** A workspace with no dependencies recorded in the selected time range. */
export const NoServices: Story = {
	args: { services: 0 },
	play: async ({ canvasElement }): Promise<void> => {
		await within(canvasElement).findByTestId(
			'service-map-empty',
			undefined,
			untilLoaded,
		);
	},
};

/** The filter's real empty branch when no resource attributes have been ingested. */
export const NoResourceAttributes: Story = {
	args: { resourceAttributes: false },
	play: async ({ canvasElement }): Promise<void> => {
		const filter = await within(canvasElement).findByTestId(
			'resource-attributes-filter',
			undefined,
			untilLoaded,
		);

		await userEvent.click(within(filter).getByRole('combobox'));
		await screen.findByText(
			/No resource attributes available to filter/i,
			undefined,
			untilLoaded,
		);
	},
};

/**
 * The attribute filter open: of everything the endpoint returns, the map only
 * offers the three keys it can send to `/dependency_graph`.
 */
export const FilterAttributes: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);
		const filter = await canvas.findByTestId(
			'resource-attributes-filter',
			undefined,
			untilLoaded,
		);

		// The list opens on a press on the input or anywhere in the field around it.
		await userEvent.click(within(filter).getByRole('combobox'));
		await screen.findByText('k8s.cluster.name', undefined, untilLoaded);
	},
};

/** A key staged as a chip, the filter open again on how to match it. */
export const FilterOperators: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await openAttributeFilterOn(canvasElement, 'k8s.cluster.name');
		await pickOption('k8s.cluster.name');
		await openAttributeFilterOn(canvasElement, 'Not IN');
	},
};

/** A key and `IN` staged, the filter open on the values the key holds. */
export const FilterValues: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await stageClusterIn(canvasElement);
	},
};

/** Two values ticked before the filter is left, which is what applies it. */
export const FilterValuesSelected: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await stageClusterIn(canvasElement);
		await pickOption('prod-us-east');
		await pickOption('prod-eu-west');
		await waitFor(
			() =>
				expect(
					document.querySelectorAll('[role="option"][aria-selected="true"]'),
				).toHaveLength(2),
			untilLoaded,
		);
	},
};

/** The environment selector open on the environments the calls came from. */
export const EnvironmentOptions: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await openSelect(canvasElement, 'resource-environment-filter');
		await waitFor(
			() =>
				expect(
					document.querySelector(`${OPEN_LISTBOX} [role="option"]`),
				).not.toBeNull(),
			untilLoaded,
		);
	},
};
