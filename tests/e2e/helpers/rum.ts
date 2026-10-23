import { randomBytes } from 'crypto';

import { expect, type Page } from '@playwright/test';

import { authToken, seederUrl } from './common';

const APPLICATIONS_API = '/api/v1/rum/applications';
const CHROME =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PRODUCT = '/product/:id';

export interface SeededApplication {
	id: string;
	sessionId: string;
}

const hex = (bytes: number): string => randomBytes(bytes).toString('hex');

async function seed(
	page: Page,
	signal: 'traces' | 'logs',
	items: Record<string, unknown>[],
): Promise<void> {
	const response = await page.request.post(
		`${seederUrl()}/telemetry/${signal}`,
		{ data: items, headers: { 'Content-Type': 'application/json' } },
	);
	if (!response.ok()) {
		throw new Error(
			`seeder POST /telemetry/${signal} ${response.status()}: ${await response.text()}`,
		);
	}
}

/**
 * Creates an application and seeds one session as the RUM gateway would
 * store it: two views, a request, a vital, a click and an error.
 */
export async function seedRumSession(
	page: Page,
	name: string,
): Promise<SeededApplication> {
	const token = await authToken(page);
	const created = await page.request.post(APPLICATIONS_API, {
		headers: { Authorization: `Bearer ${token}` },
		data: {
			name,
			platform: 'web',
			environment: 'production',
			allowedOrigins: ['https://shop.example.com'],
		},
	});
	if (!created.ok()) {
		throw new Error(
			`create application ${created.status()}: ${await created.text()}`,
		);
	}
	const { data } = (await created.json()) as { data: { id: string } };
	const sessionId = hex(16);
	const t0 = Date.now() - 120_000;
	const at = (ms: number): string => new Date(t0 + ms).toISOString();
	const resources = {
		'fusescope.rum.application.id': data.id,
		'fusescope.rum.platform': 'web',
		'service.name': name,
		'service.version': '1.8.0',
		'deployment.environment.name': 'production',
		'user_agent.original': CHROME,
	};
	const span = (
		spanName: string,
		startMs: number,
		durationS: number,
		attributes: Record<string, unknown>,
		kind = 1,
	): Record<string, unknown> => ({
		timestamp: at(startMs),
		trace_id: hex(16),
		span_id: hex(8),
		name: spanName,
		kind,
		duration: `PT${durationS}S`,
		resources,
		attributes: { 'session.id': sessionId, ...attributes },
	});
	const event = (
		eventName: string,
		atMs: number,
		attributes: Record<string, unknown>,
	): Record<string, unknown> => ({
		timestamp: at(atMs),
		body: '',
		severity_text: eventName === 'exception' ? 'ERROR' : 'INFO',
		resources,
		attributes: {
			'session.id': sessionId,
			'event.name': eventName,
			...attributes,
		},
	});

	await seed(page, 'traces', [
		span('view', 0, 4, {
			'fusescope.rum.view.route': PRODUCT,
			'url.path': '/product/88213',
			'fusescope.rum.view.loading_type': 'initial_load',
		}),
		span('view', 4000, 6, {
			'fusescope.rum.view.route': '/cart',
			'url.path': '/cart',
			'fusescope.rum.view.loading_type': 'route_change',
		}),
		span(
			'GET',
			1000,
			0.9,
			{
				'fusescope.rum.view.route': PRODUCT,
				'url.full': 'https://shop.example.com/api/products/88213',
				'http.request.method': 'GET',
				'http.response.status_code': 200,
			},
			3,
		),
	]);
	await seed(page, 'logs', [
		event('browser.web_vital', 1500, {
			'fusescope.rum.view.route': PRODUCT,
			'browser.web_vital.name': 'lcp',
			'browser.web_vital.value': 2100.5,
			'browser.web_vital.rating': 'good',
		}),
		event('browser.user_action.click', 3900, {
			'fusescope.rum.view.route': PRODUCT,
			'fusescope.rum.action.type': 'click',
			'fusescope.rum.action.target': 'a.cart-link',
		}),
		event('exception', 5000, {
			'fusescope.rum.view.route': '/cart',
			'exception.type': 'TypeError',
			'exception.message': 'price is undefined',
			'fusescope.rum.error.source': 'onerror',
		}),
	]);
	return { id: data.id, sessionId };
}

/** Waits until the application's views list has `route`. */
export async function waitForRoute(
	page: Page,
	applicationId: string,
	route: string,
): Promise<void> {
	const token = await authToken(page);
	await expect
		.poll(
			async () => {
				const response = await page.request.get(
					`${APPLICATIONS_API}/${applicationId}/views`,
					{
						headers: { Authorization: `Bearer ${token}` },
						params: { start: Date.now() - 3_600_000, end: Date.now() },
					},
				);
				const body = (await response.json()) as {
					data?: { routes?: { route: string }[] | null };
				};
				return (body.data?.routes ?? []).map((candidate) => candidate.route);
			},
			{ timeout: 60_000 },
		)
		.toContain(route);
}

export async function deleteRumApplication(
	page: Page,
	applicationId: string,
): Promise<void> {
	const token = await authToken(page);
	await page.request.delete(`${APPLICATIONS_API}/${applicationId}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
}
