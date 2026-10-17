import ROUTES from 'constants/routes';

import { isFullScreenRoute } from '../utils';

describe('isFullScreenRoute', () => {
	it.each([
		ROUTES.HOME,
		ROUTES.APPLICATION,
		'/services/checkout-api',
		ROUTES.LOGS_EXPLORER,
		'/dashboard/abc',
		ROUTES.SETTINGS,
		'/ai-assistant/abc',
	])('keeps the sidebar and header on %s', (pathname) => {
		expect(isFullScreenRoute(pathname)).toBe(false);
	});

	it.each([
		ROUTES.ONBOARDING,
		ROUTES.GET_STARTED_WITH_CLOUD,
		'/public/dashboard/abc',
		'/dashboard/abc/panel/def',
	])('renders %s without the sidebar and header', (pathname) => {
		expect(isFullScreenRoute(pathname)).toBe(true);
	});
});
