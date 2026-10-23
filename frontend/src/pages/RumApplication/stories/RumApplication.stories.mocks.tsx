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
import {
	rumErrorGroup,
	rumErrorGroups,
	rumSourceMaps,
} from '@/storybook/msw/__story_mockdata__/rumErrors';
import {
	rumSession,
	rumSessions,
	rumView,
	rumViews,
} from '@/storybook/msw/__story_mockdata__/rumQueries';

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
		oldSdk: toggleControl('Views before SDK 0.2.0', {
			group: 'Frontend · views',
			description: 'On, routes also have views without a loading type.',
			value: false,
		}),
		sourceMapMissing: toggleControl('Source map missing', {
			group: 'Frontend · errors',
			description: 'On, the error’s release has no uploaded source maps.',
			value: false,
		}),
		noSourceMaps: toggleControl('No uploads', {
			group: 'Frontend · errors',
			description: 'On, the application has no uploaded source maps.',
			value: false,
		}),
		truncated: toggleControl('Large session', {
			group: 'Frontend · sessions',
			description: 'On, the session has more events than one response carries.',
			value: false,
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
			`${APPS}/:id/views/:route`,
			response.json((req) =>
				ok(rumView(decodeURIComponent(String(req.params.route)))),
			),
		),
		rest.get(
			`${APPS}/:id/views`,
			response.json(() => ok(rumViews(!values.telemetry, values.oldSdk))),
		),
		rest.get(
			`${APPS}/:id/errors/:fingerprint`,
			response.json((req) =>
				ok(
					rumErrorGroup(String(req.params.fingerprint), {
						mapped: !values.sourceMapMissing,
					}),
				),
			),
		),
		rest.get(
			`${APPS}/:id/errors`,
			response.json(() => ok(rumErrorGroups(!values.telemetry))),
		),
		rest.get(
			`${APPS}/:id/sourcemaps`,
			response.json((req) =>
				ok(
					rumSourceMaps({
						empty: values.noSourceMaps,
						release: req.url.searchParams.get('release') ?? undefined,
						without: values.sourceMapMissing ? '1.8.0' : undefined,
					}),
				),
			),
		),
		rest.get(
			`${APPS}/:id/sessions/:sessionId`,
			response.json(() => ok(rumSession(values.truncated))),
		),
		rest.get(
			`${APPS}/:id/sessions`,
			response.json((req) =>
				ok(
					rumSessions({
						empty: !values.telemetry,
						hasError: req.url.searchParams.get('hasError') === 'true',
					}),
				),
			),
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
