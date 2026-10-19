import { test, expect } from '../../fixtures/auth';
import {
	gotoTraceUntilLoaded,
	loadLargeTrace,
	seedTracesViaSeeder,
} from '../../helpers/trace-details';

// §1 header — the Analytics sheet. The action cluster (Analytics button
// + options menu, shown in the app header) only renders once trace data is
// loaded, which gotoTraceUntilLoaded guarantees by waiting for the root
// waterfall row.
//
// Not covered here: subheader summary (presentational → unit test), colour-by /
// options menu / trace-id copy (unit), Noz button (feature-flagged, lives in the
// filter bar).
const trace = loadLargeTrace();

test.describe('Trace details — header analytics sheet', () => {
	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await seedTracesViaSeeder(request, trace.spans);
		await request.dispose();
	});

	test.beforeEach(async ({ authedPage: page }) => {
		await gotoTraceUntilLoaded(
			page,
			`/trace/${trace.traceId}`,
			`cell-0-${trace.landmarks.root}`,
		);
	});

	test('TC-01 the analytics sheet opens with its tabs and closes', async ({
		authedPage: page,
	}) => {
		await page.getByRole('button', { name: 'Analytics' }).click();
		const sheet = page.getByRole('dialog', { name: 'Analytics' });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByTestId('trace-analytics-panel')).toBeVisible();
		await expect(sheet.getByRole('tab', { name: '% exec time' })).toBeVisible();
		await expect(sheet.getByRole('tab', { name: 'Spans' })).toBeVisible();

		await sheet.getByRole('button', { name: 'Close' }).click();
		await expect(sheet).toBeHidden();
	});
});
