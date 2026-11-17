import { randomBytes } from 'crypto';

import type { Page, Response } from '@playwright/test';

import { expect, test } from '../../../fixtures/alerts/alert-rules';
import { AlertType } from '../../../helpers/alert-forms/constants';
import { gotoCreateAlertV1 } from '../../../helpers/alert-forms/navigation';
import { dropdownOption } from '../../../helpers/alert-forms/shared';
import {
	ANOMALY_BASELINE,
	ANOMALY_SCALE,
	ANOMALY_SPIKE,
	ANOMALY_SPIKE_POINTS,
	DAY_MS,
} from '../../../helpers/alerts/constants';
import { seedAnomalyMetric } from '../../../helpers/alerts/seeding';
import type {
	AnomalyPreviewRequest,
	AnomalyPreviewResponse,
	AnomalyPreviewSeries,
} from '../../../helpers/alerts/types';

const Z_SCORE = 3;
const HALF_WIDTH = Z_SCORE * ANOMALY_SCALE;

function isDailyAnomalyPreview(
	response: Response,
	metricName: string,
): boolean {
	if (!response.url().includes('/api/v5/query_range')) {
		return false;
	}
	const body = response.request().postDataJSON() as AnomalyPreviewRequest | null;
	const spec = body?.compositeQuery?.queries?.[0]?.spec;
	const args = spec?.functions?.find((fn) => fn.name === 'anomaly')?.args ?? [];
	const arg = (name: string): unknown =>
		args.find((entry) => entry.name === name)?.value;
	return (
		spec?.aggregations?.[0]?.metricName === metricName &&
		arg('seasonality') === 'daily' &&
		arg('z_score_threshold') === Z_SCORE
	);
}

async function pickInlineOption(
	page: Page,
	testId: string,
	label: string,
): Promise<void> {
	await page.getByTestId(testId).click();
	await dropdownOption(page, label).click();
}

function byTimestamp(
	series: AnomalyPreviewSeries | undefined,
): Map<number, number> {
	return new Map(
		(series?.values ?? []).map((point) => [point.timestamp, Number(point.value)]),
	);
}

test.describe('Alert create — anomaly preview band', () => {
	test('TC-01 the preview draws the predicted line and band, with the spike outside it', async ({
		authedPage: page,
	}) => {
		const metricName = `e2e_anomaly_band_${randomBytes(4).toString('hex')}`;
		await seedAnomalyMetric(page, {
			metricName,
			labels: { service: 'api' },
			periodMs: DAY_MS,
			spike: ANOMALY_SPIKE,
		});

		await gotoCreateAlertV1(page, { alertType: AlertType.METRICS });
		await page.getByText('Anomaly Detection Alert', { exact: true }).click();

		await pickInlineOption(
			page,
			'alert-anomaly-deviation-select',
			String(Z_SCORE),
		);
		await pickInlineOption(page, 'alert-anomaly-seasonality-select', 'Daily');

		const metricInput = page
			.getByTestId('metric-name-selector-0')
			.locator('input');
		await metricInput.fill(metricName);
		await dropdownOption(page, metricName).click();

		const previewResponse = page.waitForResponse((response) =>
			isDailyAnomalyPreview(response, metricName),
		);
		await page.getByRole('button', { name: /run query/i }).click();
		const response = await previewResponse;
		expect(response.ok()).toBeTruthy();

		const legend = page.locator('.anomaly-alert-evaluation-view .u-legend');
		for (const label of [
			'Main Series',
			'Predicted Value',
			'Upper Band',
			'Lower Band',
		]) {
			await expect(legend.getByText(label, { exact: true })).toBeVisible();
		}

		const body = (await response.json()) as AnomalyPreviewResponse;
		const [aggregation] = body.data.data.results[0].aggregations;
		const values = aggregation.series?.[0]?.values ?? [];
		const predicted = byTimestamp(aggregation.predictedSeries?.[0]);
		const upper = byTimestamp(aggregation.upperBoundSeries?.[0]);
		const lower = byTimestamp(aggregation.lowerBoundSeries?.[0]);

		const banded = values.filter((point) => upper.has(point.timestamp));
		expect(banded.length).toBeGreaterThan(ANOMALY_SPIKE_POINTS);
		for (const { timestamp } of banded) {
			expect(predicted.get(timestamp)).toBeCloseTo(ANOMALY_BASELINE, 3);
			expect(upper.get(timestamp)).toBeCloseTo(ANOMALY_BASELINE + HALF_WIDTH, 3);
			expect(lower.get(timestamp)).toBeCloseTo(ANOMALY_BASELINE - HALF_WIDTH, 3);
		}

		const spikes = banded.filter(
			(point) => Number(point.value) === ANOMALY_SPIKE,
		);
		const steady = banded.filter(
			(point) => Number(point.value) === ANOMALY_BASELINE,
		);
		expect(spikes.length).toBeGreaterThan(0);
		expect(steady.length).toBeGreaterThan(0);
		for (const { timestamp, value } of spikes) {
			expect(Number(value)).toBeGreaterThan(upper.get(timestamp) ?? Infinity);
		}
		for (const { timestamp, value } of steady) {
			expect(Number(value)).toBeLessThanOrEqual(upper.get(timestamp) ?? -Infinity);
			expect(Number(value)).toBeGreaterThanOrEqual(
				lower.get(timestamp) ?? Infinity,
			);
		}
	});
});
