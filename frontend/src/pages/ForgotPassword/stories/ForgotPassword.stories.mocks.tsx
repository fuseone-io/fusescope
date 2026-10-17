/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import { StatusCodes } from 'http-status-codes';
import ROUTES from 'constants/routes';
import { rest } from 'msw';

import { choiceControl, countControl } from '@/storybook/controls/controls';
import { defineStoryMocks } from '@/storybook/controls/defineStoryMocks';

import {
	forgotPasswordRouteState,
	ORG_MAX,
} from './__story_mockdata__/forgotPassword';

const RESET = 'Forgot password · reset';

const REQUESTS = ['accepted', 'rejected', 'unsupported'] as const;

type ResetRequest = (typeof REQUESTS)[number];

export const forgotPasswordMocks = defineStoryMocks({
	controls: {
		orgs: countControl('Organizations', {
			group: RESET,
			description:
				'Workspaces the email belongs to. More than one adds the workspace picker, because the reset is scoped to one.',
			value: 1,
			max: ORG_MAX,
		}),
		request: choiceControl<ResetRequest>('Reset request', {
			group: RESET,
			description:
				'What the reset endpoint answers when the form is sent: the check-your-inbox screen, the error under the button, or the ask-an-admin screen when `user.password.reset.allow_self` is off.',
			options: REQUESTS,
			value: 'accepted',
		}),
	},
	handlers: (values) => [
		rest.post(
			'http://localhost/api/v2/factor_password/forgot',
			(_req, res, ctx) => {
				if (values.request === 'accepted') {
					return res(ctx.status(StatusCodes.NO_CONTENT));
				}
				if (values.request === 'unsupported') {
					return res(
						ctx.status(StatusCodes.NOT_IMPLEMENTED),
						ctx.json({
							error: {
								code: 'unsupported',
								message:
									'Users are not allowed to reset their password themselves, please contact an admin to reset your password.',
								url: '',
								errors: [],
							},
						}),
					);
				}
				return res(
					ctx.status(StatusCodes.TOO_MANY_REQUESTS),
					ctx.json({
						error: {
							code: 'rate_limited',
							message: 'Too many reset emails were sent. Try again in an hour.',
							url: '',
							errors: [],
						},
					}),
				);
			},
		),
	],
	config: (values) => ({
		route: ROUTES.FORGOT_PASSWORD,
		routeState: forgotPasswordRouteState(values.orgs),
		// Resetting a password is what a signed-out browser does, so the shell has
		// no side nav, top nav or banners to draw.
		appContext: { isLoggedIn: false },
	}),
});
