import { Route } from 'react-router-dom';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render } from 'tests/test-utils';

import RumApplication from '../index';

export const APP = {
	id: 'app-1',
	orgId: 'org',
	name: 'web-shop',
	platform: 'web',
	environment: 'production',
	allowedOrigins: [],
	tracePropagationUrls: [],
	sampleRate: 1,
	createdBy: 'admin',
	firstSeenAt: null,
	piiPolicy: {
		dropQuery: true,
		queryAllowlist: [],
		urlAllowlist: [],
		geoLookup: true,
		requireConsent: false,
		hashUserId: true,
	},
};

export const ANDROID_APP = {
	...APP,
	name: 'shop-android',
	platform: 'android',
	allowedPackageNames: ['com.example.shop'],
};

export const ok = (data: unknown): Record<string, unknown> => ({
	status: 'success',
	data,
});

/** Serves the application and renders the page at `path`. */
export function renderPage(
	path = '/frontend/applications/app-1',
	app: Record<string, unknown> = APP,
): void {
	server.use(
		rest.get('*/api/v1/rum/applications/app-1', (_req, res, ctx) =>
			res(ctx.json(ok(app))),
		),
	);
	render(
		<Route path="/frontend/applications/:id">
			<RumApplication />
		</Route>,
		undefined,
		{ initialRoute: path },
	);
}
