import ROUTES from 'constants/routes';

import { embedsDashboard, showsGlobalTimePicker } from '../utils';

// A page that embeds a dashboard has the dashboard's own time picker and
// refresh; the header's would be a second one.
describe('showsGlobalTimePicker', () => {
	it.each([
		ROUTES.INFRASTRUCTURE_MONITORING_COLLECTORS,
		ROUTES.AI_OBSERVABILITY_OVERVIEW,
	])('leaves the picker to the embedded dashboard on %s', (route) => {
		expect(showsGlobalTimePicker(route)).toBe(false);
	});

	it.each([
		ROUTES.INFRASTRUCTURE_MONITORING_HOSTS,
		ROUTES.INFRASTRUCTURE_MONITORING_KUBERNETES,
	])('keeps the header picker on %s', (route) => {
		expect(showsGlobalTimePicker(route)).toBe(true);
	});
});

describe('embedsDashboard', () => {
	it.each([
		ROUTES.INFRASTRUCTURE_MONITORING_COLLECTORS,
		ROUTES.AI_OBSERVABILITY_OVERVIEW,
	])('is true on %s', (route) => {
		expect(embedsDashboard(route)).toBe(true);
	});

	it('is false on a page without one', () => {
		expect(embedsDashboard(ROUTES.INFRASTRUCTURE_MONITORING_HOSTS)).toBe(false);
	});
});
