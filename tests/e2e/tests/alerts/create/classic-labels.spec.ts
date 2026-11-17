import type { Locator } from '@playwright/test';

import { expect, test } from '../../../fixtures/alerts/alert-rules';
import { AlertType } from '../../../helpers/alert-forms/constants';
import { gotoCreateAlertV1 } from '../../../helpers/alert-forms/navigation';
import { labelPill } from '../../../helpers/alert-forms/v2';

// CL-* — the classic form's label editor.

async function expectUncovered(control: Locator): Promise<void> {
	await control.scrollIntoViewIfNeeded();
	await expect(control).toBeInViewport({ ratio: 1 });
	const onTop = await control.evaluate((el) => {
		const box = el.getBoundingClientRect();
		const hit = document.elementFromPoint(
			box.x + box.width / 2,
			box.y + box.height / 2,
		);
		return hit !== null && (hit === el || el.contains(hit));
	});
	expect(onTop).toBe(true);
}

for (const viewport of [
	{ name: 'desktop', width: 1440, height: 900 },
	{ name: 'phone', width: 390, height: 844 },
]) {
	test(`CL-01 the key, value and Add controls are shown in full on ${viewport.name}`, async ({
		authedPage: page,
	}) => {
		await page.setViewportSize(viewport);
		await gotoCreateAlertV1(page, { alertType: AlertType.METRICS });

		const key = page.getByTestId('alert-labels-key-input');
		const value = page.getByTestId('alert-labels-value-input');
		const add = page.getByTestId('alert-labels-add-button');

		for (const [labelKey, labelValue] of [
			['team', 'payments'],
			['env', 'prod'],
			['region', 'us-east-1'],
		]) {
			await expectUncovered(key);
			await key.fill(labelKey);
			await expectUncovered(value);
			await value.fill(labelValue);
			await expectUncovered(add);
			await add.click();
			await expect(labelPill(page, labelKey, labelValue)).toBeVisible();
		}

		await expectUncovered(key);
		await expectUncovered(page.getByTestId('alert-labels-clear-button'));
	});
}
