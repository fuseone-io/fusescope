import { expect, test } from '../../fixtures/auth';
import { newAdminContext } from '../../helpers/auth';
import {
	deleteRumApplication,
	seedRumSession,
	type SeededApplication,
	waitForRoute,
} from '../../helpers/rum';

test.describe.configure({ mode: 'serial' });

let seeded: SeededApplication | undefined;

test.beforeAll(async ({ browser }) => {
	test.setTimeout(150_000);
	const ctx = await newAdminContext(browser);
	const page = await ctx.newPage();
	try {
		await page.goto('/frontend/applications');
		seeded = await seedRumSession(page, `e2e-views-${Date.now()}`);
		await waitForRoute(page, seeded.id, '/product/:id');
	} finally {
		await ctx.close();
	}
});

test.afterAll(async ({ browser }) => {
	if (!seeded) {
		return;
	}
	const ctx = await newAdminContext(browser);
	const page = await ctx.newPage();
	try {
		await page.goto('/frontend/applications');
		await deleteRumApplication(page, seeded.id);
	} finally {
		await ctx.close();
	}
});

test('RUM-02 open a route from Views', async ({ authedPage: page }) => {
	const app = seeded!;
	await page.goto(`/frontend/applications/${app.id}/views?relativeTime=1h`);

	const route = page
		.getByTestId('rum-views-open')
		.filter({ hasText: '/product/:id' });
	await expect(route).toBeVisible();
	await route.click();

	await expect(page).toHaveURL(/route=%2Fproduct%2F%3Aid/);
	const sheet = page.getByTestId('rum-route-sheet');
	await expect(sheet.getByTestId('rum-route-request')).toHaveCount(1);
	await expect(sheet.getByTestId('rum-route-session-open')).toHaveCount(1);
	await expect(sheet.getByTestId('rum-route-create-alert')).toBeDisabled();
});

test('RUM-03 open a session timeline from Sessions', async ({
	authedPage: page,
}) => {
	const app = seeded!;
	await page.goto(`/frontend/applications/${app.id}?relativeTime=1h`);
	await page.getByTestId('page-tab-sessions').click();

	await expect(page).toHaveURL(new RegExp(`/applications/${app.id}/sessions`));
	await page.getByTestId('rum-sessions-open').first().click();

	await expect(page).toHaveURL(new RegExp(`/sessions/${app.sessionId}`));
	await expect(page.getByTestId('rum-session-id')).toHaveText(app.sessionId);
	await expect(page.getByTestId('rum-session-view')).toHaveCount(2);
	await expect(page.getByTestId('rum-session-event-error-link')).toHaveAttribute(
		'href',
		/logs-explorer/,
	);
	await page.getByTestId('rum-session-back').click();
	await expect(page.getByTestId('rum-sessions-row')).toHaveCount(1);
});
