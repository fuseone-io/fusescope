/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import { rest } from 'msw';

import {
	choiceControl,
	countControl,
	toggleControl,
} from '@/storybook/controls/controls';
import { defineStoryMocks } from '@/storybook/controls/defineStoryMocks';
import {
	RUM_APPLICATIONS,
	rumApplication,
	rumApplicationKeys,
	rumApplicationStatus,
	rumQueryRangeResponse,
} from '@/storybook/msw/__story_mockdata__/rum';

const LIST = 'Frontend · applications';
const SETUP = 'Frontend · setup';
const APPS = 'http://localhost/api/v1/rum/applications';

type SetupStatus = 'waiting' | 'receiving';

const ok = (data: unknown): Record<string, unknown> => ({
	status: 'success',
	data,
});

export const rumApplicationsMocks = defineStoryMocks({
	controls: {
		applications: countControl('Applications', {
			group: LIST,
			description:
				'How many applications the workspace has; 0 is the empty state.',
			value: 3,
			max: RUM_APPLICATIONS.length,
		}),
		telemetry: toggleControl('Telemetry', {
			group: LIST,
			description:
				'Off, the applications exist but have sent nothing in the range.',
			value: true,
		}),
		setupStatus: choiceControl<SetupStatus>('Setup status', {
			group: SETUP,
			description: 'What the setup sheet’s install tab polls from `/status`.',
			options: ['waiting', 'receiving'],
			value: 'waiting',
		}),
		rotating: toggleControl('Rotating key', {
			group: SETUP,
			description:
				'A rotation is under way, so an expiring key sits beside the active one.',
			value: false,
		}),
	},
	handlers: (values, response) => [
		rest.get(
			APPS,
			response.json(() => ok(RUM_APPLICATIONS.slice(0, values.applications))),
		),
		rest.post(
			APPS,
			response.json(() =>
				ok({
					...rumApplication({
						id: 'app-new',
						name: 'web-shop-next',
						firstSeenAt: null,
					}),
					key: {
						...rumApplicationKeys(false)[0],
						id: 'key-new',
						applicationId: 'app-new',
						last4: 'Lw4R',
						key: 'rum_pub_8Fh2kQ7vXz3mN9cLw4R',
					},
				}),
			),
		),
		rest.get(`${APPS}/:id/status`, (_req, res, ctx) =>
			res(ctx.json(ok(rumApplicationStatus(values.setupStatus === 'receiving')))),
		),
		rest.get(`${APPS}/:id/keys`, (_req, res, ctx) =>
			res(ctx.json(ok(rumApplicationKeys(values.rotating)))),
		),
		rest.post(`${APPS}/:id/keys/:keyId/rotate`, (_req, res, ctx) =>
			res(
				ctx.status(201),
				ctx.json(
					ok({
						...rumApplicationKeys(false)[0],
						id: 'key-rotated',
						last4: 'Zq7P',
						key: 'rum_pub_Qm2Vx8LkT4nRw6YbZq7P',
					}),
				),
			),
		),
		rest.get(`${APPS}/:id`, (req, res, ctx) =>
			res(
				ctx.json(
					ok(
						RUM_APPLICATIONS.find((app) => app.id === req.params.id) ??
							rumApplication({ id: String(req.params.id), name: 'web-shop-next' }),
					),
				),
			),
		),
		rest.put(`${APPS}/:id`, async (req, res, ctx) =>
			res(ctx.json(ok({ ...rumApplication({}), ...(await req.json()) }))),
		),
		rest.post(
			'http://localhost/api/v5/query_range',
			response.json(async (req) =>
				rumQueryRangeResponse(await req.json(), !values.telemetry),
			),
		),
	],
});
