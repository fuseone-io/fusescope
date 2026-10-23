import { rest } from 'msw';

import { choiceControl, toggleControl } from '@/storybook/controls/controls';
import { defineStoryMocks } from '@/storybook/controls/defineStoryMocks';

import {
	connectionStatusResponse,
	INGESTION_SOURCES,
	type IngestionSource,
	ingestionResponse,
	integrationsResponse,
	statusResponse,
} from './__story_mockdata__/onboarding';

const ONBOARDING = 'Get started · data';

/** The onboarding endpoints the catalog, the guides and Home's empty state read. */
export const onboardingMocks = defineStoryMocks({
	controls: {
		ingestionSource: choiceControl<IngestionSource>('Ingestion endpoint', {
			group: ONBOARDING,
			description:
				'`derived` is guessed from the external URL on the default ports, and marked so; `organization` is the URL an admin set.',
			options: INGESTION_SOURCES,
			value: 'derived',
		}),
		receiving: toggleControl('Receiving data', {
			group: ONBOARDING,
			description:
				'Every signal received in the window, for the status strip and the guide check; off is a brand-new install.',
			value: true,
		}),
	},
	handlers: (values, response) => [
		rest.get(
			'http://localhost/api/v1/onboarding/ingestion',
			response.json(() => ingestionResponse(values.ingestionSource)),
		),
		rest.put(
			'http://localhost/api/v1/onboarding/ingestion',
			response.json(() => ingestionResponse('organization')),
		),
		rest.get(
			'http://localhost/api/v1/onboarding/status',
			response.json((req) =>
				statusResponse(values.receiving, req.url.searchParams.get('service')),
			),
		),
		rest.get(
			'http://localhost/api/v1/integrations',
			response.json(() => integrationsResponse),
		),
		rest.get(
			'http://localhost/api/v1/integrations/:integrationId/connection_status',
			response.json((req) =>
				connectionStatusResponse(
					values.receiving && req.params.integrationId === 'builtin-redis',
				),
			),
		),
	],
});
