/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import { rest } from 'msw';

import { toggleControl } from '@/storybook/controls/controls';
import { defineStoryMocks } from '@/storybook/controls/defineStoryMocks';
import {
	RUM_APPLICATIONS,
	rumApplicationKeys,
	rumApplicationStatus,
	rumQueryRangeResponse,
} from '@/storybook/msw/__story_mockdata__/rum';

const APPS = 'http://localhost/api/v1/rum/applications';

const ok = (data: unknown): Record<string, unknown> => ({
	status: 'success',
	data,
});

export const rumApplicationMocks = defineStoryMocks({
	controls: {
		telemetry: toggleControl('Telemetry', {
			group: 'Frontend · overview',
			description: 'Off, the application has sent nothing in the range.',
			value: true,
		}),
	},
	handlers: (values, response) => [
		rest.get(`${APPS}/:id/status`, (_req, res, ctx) =>
			res(ctx.json(ok(rumApplicationStatus(true)))),
		),
		rest.get(`${APPS}/:id/keys`, (_req, res, ctx) =>
			res(ctx.json(ok(rumApplicationKeys(false)))),
		),
		rest.get(
			`${APPS}/:id`,
			response.json(() => ok(RUM_APPLICATIONS[0])),
		),
		rest.post(
			'http://localhost/api/v5/query_range',
			response.json(async (req) =>
				rumQueryRangeResponse(await req.json(), !values.telemetry),
			),
		),
	],
});
