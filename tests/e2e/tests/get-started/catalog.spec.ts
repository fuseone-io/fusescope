import { expect, test } from '../../fixtures/auth';

test.describe('Get started', () => {
	test('GS-01 the old onboarding URL redirects to the catalog, keeping its query', async ({
		authedPage: page,
	}) => {
		await page.goto('/get-started-with-signoz-cloud?q=java');

		await expect(page).toHaveURL(/\/get-started\?q=java$/);
		await expect(page.getByTestId('catalog-entry-java')).toBeVisible();
		await expect(page.getByTestId('catalog-entry-nginx')).toHaveCount(0);
	});

	test('GS-02 the Node.js guide waits for data from the named service', async ({
		authedPage: page,
	}) => {
		const service = `e2e-onboarding-${Date.now()}`;

		await page.goto('/get-started');
		await expect(page.getByTestId('get-started-ingestion')).toBeVisible();
		await page.getByTestId('catalog-entry-nodejs').click();

		await expect(page).toHaveURL(/\/get-started\/nodejs$/);
		await page.getByTestId('guide-service').fill(service);
		await expect(page.getByTestId('guide-run-snippet-shell')).toContainText(
			`export OTEL_SERVICE_NAME=${service}`,
		);

		const statusRequest = page.waitForRequest(
			(request) =>
				request.url().includes('/api/v1/onboarding/status') &&
				new URL(request.url()).searchParams.get('service') === service,
		);
		await page.getByTestId('guide-start').click();

		await expect(page.getByTestId('guide-waiting')).toContainText(
			`Waiting for data from ${service}`,
		);
		await statusRequest;
	});
});
