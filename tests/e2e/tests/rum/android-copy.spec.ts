import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

import { expect, test } from '../../fixtures/auth';
import { authToken } from '../../helpers/common';
import { deleteRumApplication } from '../../helpers/rum';

const APPLICATIONS = '/api/v1/rum/applications';
const R8_FIXTURES = path.resolve(
	__dirname,
	'../../../../pkg/types/rumtypes/testdata/r8',
);

test('TC-01 Android mappings and error details use Android labels and device data', async ({
	authedPage: page,
}) => {
	await page.goto('/frontend/applications');
	const token = await authToken(page);
	const headers = { Authorization: `Bearer ${token}` };
	const created = await page.request.post(APPLICATIONS, {
		headers,
		data: {
			name: `e2e-android-copy-${randomBytes(4).toString('hex')}`,
			platform: 'android',
			environment: 'production',
			allowedPackageNames: ['com.example.shop'],
		},
	});
	expect(created.ok()).toBeTruthy();
	const { data: app } = (await created.json()) as {
		data: { id: string; key: { key: string } };
	};
	try {
		const uploaded = await page.request.post(
			`${APPLICATIONS}/${app.id}/mappings?release=1.8.0`,
			{
				headers: { ...headers, 'Content-Type': 'text/plain' },
				data: readFileSync(path.join(R8_FIXTURES, 'mapping.txt'), 'utf8'),
			},
		);
		expect(uploaded.ok()).toBeTruthy();

		await page.goto(`/frontend/applications/${app.id}?relativeTime=1h`);
		await page.getByTestId('rum-overview-settings').click();
		await page.getByTestId('rum-sheet-tab-sourcemaps').click();
		await expect(page.getByTestId('rum-sheet-tab-sourcemaps')).toHaveText(
			'R8 mappings',
		);
		await page.getByTestId('rum-mappings-method-api').click();
		const command = page.getByTestId('rum-mappings-api');
		await expect(command).toContainText(
			"R8_MAP_ID=$(sed -n 's/^# pg_map_id: //p'",
		);
		await expect(command).toContainText('&map_id=$R8_MAP_ID');
		await expect(page.getByText(/Set R8_MAP_ID/)).toHaveCount(0);
		await page.getByTestId('rum-sourcemaps-expand').click();
		const files = page.getByTestId('rum-sourcemaps-files');
		await expect(files).toContainText('Mapping file');
		await expect(files).toContainText('R8 map ID');
		await expect(files).toContainText('7e4c1a9');
		await expect(files).toContainText('without a matching map ID');
		await expect(files).not.toContainText('Matches bundle URL');
		await page.getByTestId('rum-sourcemaps-done').click();

		const attributes = {
			'event.name': 'exception',
			'session.id': randomBytes(16).toString('hex'),
			'exception.type': 'a.a',
			'exception.message': 'Cart is empty',
			'exception.stacktrace': readFileSync(
				path.join(R8_FIXTURES, 'crash.txt'),
				'utf8',
			),
			'fusescope.rum.error.source': 'crash',
		};
		const resources = {
			'app.package.name': 'com.example.shop',
			'service.name': 'android-copy',
			'service.version': '1.8.0',
			'os.name': 'Android',
			'os.version': '14',
			'device.manufacturer': 'Google',
			'device.model.name': 'Pixel 8',
		};
		const ingested = await page.request.post('/rum/v1/logs', {
			headers: { 'FuseScope-RUM-Key': app.key.key },
			data: {
				resourceLogs: [
					{
						resource: {
							attributes: Object.entries(resources).map(([key, value]) => ({
								key,
								value: { stringValue: value },
							})),
						},
						scopeLogs: [
							{
								logRecords: [
									{
										timeUnixNano: String(BigInt(Date.now() - 60_000) * 1_000_000n),
										severityText: 'ERROR',
										body: { stringValue: 'Cart is empty' },
										attributes: Object.entries(attributes).map(([key, value]) => ({
											key,
											value: { stringValue: value },
										})),
									},
								],
							},
						],
					},
				],
			},
		});
		expect(ingested.ok()).toBeTruthy();
		await expect
			.poll(async () => {
				const response = await page.request.get(
					`${APPLICATIONS}/${app.id}/errors`,
					{
						headers,
						params: { start: Date.now() - 3_600_000, end: Date.now() },
					},
				);
				const body = (await response.json()) as { data?: { events?: number } };
				return body.data?.events;
			})
			.toBe(1);
		await page.goto(`/frontend/applications/${app.id}/errors?relativeTime=1h`);
		await page.getByTestId('rum-error-group-open').click();
		const kpis = page.getByTestId('rum-error-kpis');
		await expect(kpis).toContainText('Top device');
		await expect(kpis).toContainText('Google Pixel 8');
		await expect(kpis).not.toContainText('Top browser');
		await expect(page.getByTestId('rum-error-type')).toHaveText(
			'com.example.shop.CartException',
		);
	} finally {
		await deleteRumApplication(page, app.id);
	}
});
