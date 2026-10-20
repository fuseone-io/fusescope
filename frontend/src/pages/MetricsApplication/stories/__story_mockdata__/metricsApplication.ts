/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import type { ServiceDataProps } from 'api/metrics/getTopLevelOperations';
import type { ServicesList } from 'types/api/metrics/getService';
import type { TopOperationList } from 'container/MetricsApplication/KeyOperations/types';
import type {
	ApDexPayloadAndSettingsProps,
	MetricMetaProps,
} from 'types/api/metrics/getApDex';

import { seededMetricValue } from '@/storybook/msw/__story_mockdata__/queryRange';

export const SERVICE_NAME = 'checkout';

/**
 * Spelled as the `tab` param carries them rather than as `MetricsApplicationTab`,
 * so a story's arg and the URL agree on a plain string.
 */
export const METRICS_APPLICATION_TABS = [
	'OVER_METRICS',
	'ENDPOINTS',
	'DEPENDENCIES',
	'ERRORS',
	'INFRASTRUCTURE',
	'DB_CALL_METRICS',
	'EXTERNAL_METRICS',
] as const;

export type MetricsApplicationTabKey =
	(typeof METRICS_APPLICATION_TABS)[number];

const OPERATION_NAMES = [
	'POST /api/checkout',
	'GET /api/cart',
	'oteldemo.CheckoutService/PlaceOrder',
	'POST /api/payment/authorize',
	'GET /api/shipping/quote',
	'SELECT orders',
	'INSERT order_items',
	'GET /api/currency/convert',
	'POST /api/email/confirmation',
	'oteldemo.CartService/EmptyCart',
];

export const TOP_OPERATION_MAX = OPERATION_NAMES.length;

/** The lines every grouped graph on the page draws, and its DB/external legends. */
export const METRICS_LABEL_VALUES: Record<string, readonly string[]> = {
	'service.name': [SERVICE_NAME, 'cart', 'payment'],
	operation: OPERATION_NAMES,
	address: [
		'payment.svc.cluster.local:8080',
		'shipping.svc.cluster.local:8080',
		'currency.svc.cluster.local:8080',
	],
	'db.system': ['postgresql', 'redis', 'mysql'],
	'status.code': ['200', '400', '500'],
	name: OPERATION_NAMES,
	'http.route': ['/api/checkout', '/api/cart', ''],
	'rpc.method': ['PlaceOrder', ''],
	'host.name': ['checkout-7d9f8-a', 'checkout-7d9f8-b'],
	'deployment.environment': ['production'],
	'telemetry.sdk.language': ['go'],
	'peer.service': ['postgresql'],
	status_message: ['payment declined: card expired', ''],
};

/** The service the page is on, with the entry points its overview graphs cover. */
export const topLevelOperationsResponse = (
	servicename: string,
): ServiceDataProps => ({
	[servicename]: OPERATION_NAMES.slice(0, 4),
});

export const topOperationsResponse = (
	count: number,
	isEntryPoint: boolean,
): { status: string; data: TopOperationList[] } => ({
	status: 'success',
	data: OPERATION_NAMES.slice(0, count).map((name, index) => {
		const p50 = seededMetricValue(index, 18, 40) * 1_000_000;
		const numCalls = Math.round(seededMetricValue(index, 400, 2600));

		return {
			// The entry-point view keeps only the operations a request enters on, so
			// it reads the same rows back with the inbound calls counted.
			name: isEntryPoint ? `${name} (entry)` : name,
			p50,
			p95: p50 * 2.4,
			p99: p50 * 3.6,
			numCalls,
			errorCount: Math.round(numCalls * (index % 4 === 0 ? 0.045 : 0)),
		};
	}),
});

export const apDexSettingsResponse = (
	servicename: string,
	threshold: number,
): { status: string; data: ApDexPayloadAndSettingsProps[] } => ({
	status: 'success',
	data: [{ servicename, threshold, excludeStatusCode: '' }],
});

/** The latency histogram's buckets, which is what the apdex score is read off. */
export const metricMetaResponse = (): MetricMetaProps => ({
	delta: false,
	le: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/** This service's row of the services list: what the KPI strip reads. */
export const serviceSummaryResponse = (): {
	status: string;
	data: ServicesList[];
} => ({
	status: 'success',
	data: [
		{
			serviceName: SERVICE_NAME,
			p99: 612_000_000,
			avgDuration: 48_000_000,
			numCalls: 14_460,
			callRate: 2.41,
			numErrors: 275,
			errorRate: 1.9,
		},
	],
});
