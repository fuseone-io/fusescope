import { expect, test } from '../../fixtures/auth';
import { newAdminContext } from '../../helpers/auth';
import { authToken } from '../../helpers/common';

const APPLICATIONS_PATH = '/frontend/applications';
const APPLICATIONS_API = '/api/v1/rum/applications';
const KEY_PATTERN = /^rum_pub_\S+$/;

test.describe.configure({ mode: 'serial' });

const created = new Set<string>();

test.afterAll(async ({ browser }) => {
	if (created.size === 0) {
		return;
	}
	const ctx = await newAdminContext(browser);
	const page = await ctx.newPage();
	try {
		await page.goto(APPLICATIONS_PATH);
		const token = await authToken(page);
		await Promise.all(
			[...created].map((id) =>
				page.request
					.delete(`${APPLICATIONS_API}/${id}`, {
						headers: { Authorization: `Bearer ${token}` },
					})
					.catch(() => undefined),
			),
		);
	} finally {
		await ctx.close();
	}
});

test('RUM-01 create an application, see its key once, then rotate it', async ({
	authedPage: page,
}) => {
	const name = `e2e-web-${Date.now()}`;

	await page.goto(APPLICATIONS_PATH);
	await page
		.getByTestId('rum-applications-new')
		.or(page.getByTestId('rum-empty-create'))
		.first()
		.click();

	await page.getByTestId('rum-app-name').fill(name);
	await page.getByTestId('rum-app-origins-input').fill('http://localhost:3360');
	await page.getByTestId('rum-app-origins-input').press('Enter');

	const createResponse = page.waitForResponse(
		(response) =>
			response.url().endsWith(APPLICATIONS_API) &&
			response.request().method() === 'POST',
	);
	await page.getByTestId('rum-app-submit').click();
	const body = (await (await createResponse).json()) as {
		data: { id: string; key: { key: string } };
	};
	created.add(body.data.id);

	const firstKey = page.getByTestId('rum-key-value');
	await expect(firstKey).toHaveText(KEY_PATTERN);
	await expect(firstKey).toHaveText(body.data.key.key);
	await expect(page.getByTestId('rum-install-snippet')).toContainText(
		`publicKey: '${body.data.key.key}'`,
	);
	await expect(page.getByTestId('rum-setup-status')).toBeVisible();

	// Reopened, the key is only its last characters.
	await page.getByTestId('rum-install-done').click();
	const row = page.getByTestId('rum-application-row').filter({ hasText: name });
	await row.getByTestId('rum-application-settings').click();
	await page.getByTestId('rum-sheet-tab-key').click();
	await expect(page.getByTestId('rum-key-row')).toHaveCount(1);
	await expect(page.getByTestId('rum-key-once')).toHaveCount(0);
	await expect(page.getByTestId('rum-key-row')).not.toContainText(
		body.data.key.key,
	);

	await page.getByTestId('rum-key-rotate').click();
	await page.getByTestId('rum-overlap-1h').click();
	await page.getByTestId('rum-rotate-confirm').click();

	const rotated = page.getByTestId('rum-key-value');
	await expect(rotated).toHaveText(KEY_PATTERN);
	await expect(rotated).not.toHaveText(body.data.key.key);
	await expect(page.getByTestId('rum-key-row')).toHaveCount(2);
	await expect(
		page.locator('[data-testid="rum-key-row"][data-status="expiring"]'),
	).toHaveCount(1);
	await expect(page.getByTestId('rum-key-rotate')).toBeDisabled();
});
