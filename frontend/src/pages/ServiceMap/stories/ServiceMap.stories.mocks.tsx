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

import { apDexSettingsResponse } from 'pages/MetricsApplication/stories/__story_mockdata__/metricsApplication';
import type { QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import { mapQueryRangeResponse } from './__story_mockdata__/mapQueryRange';
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
	topOperationsResponse,
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
				'Call edges the endpoint answers with. Every one of them is a link and its two nodes; 0 is the empty state.',
			value: MAX_DEPENDENCIES,
			max: MAX_DEPENDENCIES,
		}),
		health: choiceControl<ServiceHealth>('Service health', {
			group: GRAPH,
			description:
				'Error rate on the calls into a service: it colours nodes and edges and drives the root-cause banner.',
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
		graphFails: toggleControl('Dependency graph fails', {
			group: GRAPH,
			description: 'Answers `/dependency_graph` with a 500, the error state.',
			value: false,
		}),
		resourceAttributes: toggleControl('Resource attributes ingested', {
			group: FILTERS,
			description:
				'Off answers both autocomplete endpoints with nothing, which is what the filter reports as no resource attributes available.',
			value: true,
		}),
	},
	handlers: (values, response) => {
		return [
			rest.post(
				'http://localhost/api/v1/dependency_graph',
				async (req, res, ctx) => {
					if (values.graphFails) {
						return res(
							ctx.status(500),
							ctx.json({ error: 'dependency graph unavailable' }),
						);
					}
					const body = (await req.json()) as DependencyGraphBody;
					return res(
						ctx.json(
							dependencyGraphResponse({
								count: values.services,
								health: values.health,
								tags: body.tags,
							}),
						),
					);
				},
			),
			rest.post(
				'http://localhost/api/v5/query_range',
				response.json(async (req) =>
					mapQueryRangeResponse(
						(await req.json()) as QueryRangeRequestV5,
						dependencyGraphResponse({
							count: values.services,
							health: values.health,
						}),
					),
				),
			),
			rest.post(
				'http://localhost/api/v2/service/top_operations',
				response.json(() => ({ status: 'success', data: topOperationsResponse() })),
			),
			rest.post(
				'http://localhost/api/v1/service/top_level_operations',
				response.json(() => ({})),
			),
			rest.get('http://localhost/api/v1/settings/apdex', (req, res, ctx) =>
				res(
					ctx.json(
						apDexSettingsResponse(req.url.searchParams.get('services') ?? '', 0.5),
					),
				),
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
		];
	},
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
