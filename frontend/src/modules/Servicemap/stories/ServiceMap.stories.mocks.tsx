/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import { rest } from 'msw';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import { encode } from 'js-base64';
import type { Tags } from 'hooks/useResourceAttribute/types';
import { fireEvent, userEvent, waitFor, within } from 'storybook/test';

import {
	choiceControl,
	countControl,
	multiChoiceControl,
	toggleControl,
} from '@/storybook/controls/controls';
import { defineStoryMocks } from '@/storybook/controls/defineStoryMocks';

import {
	attributeKeysFor,
	attributeKeysResponse,
	attributeValuesFor,
	attributeValuesResponse,
	dependencyGraphResponse,
	MAX_DEPENDENCIES,
	RESOURCE_FILTERS,
	type ResourceFilter,
	resourceFilterQueries,
	SERVICE_HEALTH,
	type ServiceHealth,
} from './__story_mockdata__/serviceMap';

/** The keys are only fetched once the select opens, past the 1s default. */
const untilLoaded = { timeout: 15_000 };

const GRAPH = 'Service map · graph';
const FILTERS = 'Service map · filters';

interface DependencyGraphBody {
	tags?: Tags[];
}

const serviceMapRoute = (filters: readonly ResourceFilter[]): string => {
	if (filters.length === 0) {
		return ROUTES.SERVICE_MAP;
	}

	const params = new URLSearchParams({
		[QueryParams.resourceAttributes]: encode(
			JSON.stringify(resourceFilterQueries(filters)),
		),
	});

	return `${ROUTES.SERVICE_MAP}?${params.toString()}`;
};

export const serviceMapMocks = defineStoryMocks({
	controls: {
		services: countControl('Dependencies', {
			group: GRAPH,
			description:
				'Call edges the endpoint answers with. Every one of them is a link and its two nodes; 0 is the "No Service Found" card.',
			value: MAX_DEPENDENCIES,
			max: MAX_DEPENDENCIES,
		}),
		health: choiceControl<ServiceHealth>('Service health', {
			group: GRAPH,
			description:
				'Error rate on the calls into a service, which is what turns its node red.',
			options: SERVICE_HEALTH,
			value: 'degraded',
		}),
		filters: multiChoiceControl<ResourceFilter>('Applied filters', {
			group: FILTERS,
			description:
				'Resource attributes the page opens with, as the environment selector and a chip. The graph narrows to what they match.',
			options: RESOURCE_FILTERS,
			value: [],
		}),
		environments: countControl('Environments', {
			group: FILTERS,
			description: 'Values the environment selector offers.',
			value: 3,
			max: 5,
		}),
		resourceAttributes: toggleControl('Resource attributes ingested', {
			group: FILTERS,
			description:
				'Off answers both autocomplete endpoints with nothing, which is what the filter reports as no resource attributes available.',
			value: true,
		}),
	},
	handlers: (values, response) => [
		rest.post(
			'http://localhost/api/v1/dependency_graph',
			response.json(async (req) => {
				const body = (await req.json()) as DependencyGraphBody;

				return dependencyGraphResponse({
					count: values.services,
					health: values.health,
					tags: body.tags,
				});
			}),
		),

		rest.get(
			'http://localhost/api/v3/autocomplete/attribute_keys',
			response.json((req) =>
				attributeKeysResponse(
					values.resourceAttributes
						? attributeKeysFor(req.url.searchParams.get('searchText'))
						: [],
				),
			),
		),

		rest.get(
			'http://localhost/api/v3/autocomplete/attribute_values',
			response.json((req) =>
				attributeValuesResponse(
					values.resourceAttributes
						? attributeValuesFor(
								req.url.searchParams.get('attributeKey'),
								values.environments,
							)
						: [],
				),
			),
		),
	],
	config: (values) => ({ route: serviceMapRoute(values.filters) }),
});

/** Opens the filter under a test id: the environment trigger or the attribute field. */
export const openSelect = async (
	canvasElement: HTMLElement,
	testId: string,
): Promise<void> => {
	const field = await within(canvasElement).findByTestId(
		testId,
		undefined,
		untilLoaded,
	);

	await userEvent.click(field);
};

export const OPEN_LISTBOX = '[role="listbox"]';

const visibleOption = (title: string): HTMLElement | null =>
	Array.from(
		document.querySelectorAll<HTMLElement>(`${OPEN_LISTBOX} [role="option"]`),
	).find((option) => option.textContent === title) ?? null;

/** Picks the option labelled `title` in the open list. */
export const pickOption = async (title: string): Promise<void> => {
	const option = await waitFor(() => {
		const match = visibleOption(title);

		if (!match) {
			throw new Error(`option "${title}" not found`);
		}

		return match;
	}, untilLoaded);

	await fireEvent.click(option);
};

/**
 * Waits for the attribute filter to offer `title`. The list stays open from
 * one step to the next; it is opened only when it is not.
 */
export const openAttributeFilterOn = (
	canvasElement: HTMLElement,
	title: string,
): Promise<void> =>
	waitFor(
		async () => {
			if (visibleOption(title)) {
				return;
			}

			if (!document.querySelector(OPEN_LISTBOX)) {
				await openSelect(canvasElement, 'resource-attributes-filter');
			}

			throw new Error(`option "${title}" not shown`);
		},
		{ ...untilLoaded, interval: 500 },
	);

/** Stages `k8s.cluster.name IN` and leaves the filter open on its values. */
export const stageClusterIn = async (
	canvasElement: HTMLElement,
): Promise<void> => {
	await openAttributeFilterOn(canvasElement, 'k8s.cluster.name');
	await pickOption('k8s.cluster.name');
	await openAttributeFilterOn(canvasElement, 'IN');
	await pickOption('IN');
	await openAttributeFilterOn(canvasElement, 'staging-eu');
};
