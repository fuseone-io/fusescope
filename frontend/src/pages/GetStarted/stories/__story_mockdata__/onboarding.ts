export const INGESTION_SOURCES = ['derived', 'organization'] as const;

export type IngestionSource = (typeof INGESTION_SOURCES)[number];

export function ingestionResponse(source: IngestionSource): unknown {
	const derived = source === 'derived';
	const http = derived
		? 'http://fusescope.example.com:4318'
		: 'https://otlp.example.com';
	return {
		status: 'success',
		data: {
			otlpHttpEndpoint: http,
			otlpGrpcEndpoint: derived
				? 'fusescope.example.com:4317'
				: 'otlp.example.com:4317',
			otlpGrpcInsecure: derived,
			source,
			derived,
			authRequired: false,
			organizationUrl: derived ? null : http,
			configUrl: null,
			collector: { endpoint: 'http://localhost:4318', reachable: true },
		},
	};
}

/** Status for the whole workspace or one service, every signal received or none. */
export function statusResponse(
	receiving: boolean,
	service: string | null,
): unknown {
	const now = Date.now();
	const seen = (ago: number): number | null => (receiving ? now - ago : null);
	return {
		status: 'success',
		data: {
			since: now - 3_600_000,
			until: now,
			service,
			traces: {
				received: receiving,
				count: receiving ? 54_330 : 0,
				firstSeen: seen(3_000_000),
				lastSeen: seen(2_000),
				operations: receiving ? 12 : 0,
			},
			metrics: {
				received: receiving,
				count: receiving ? 16_620 : 0,
				firstSeen: seen(3_000_000),
				lastSeen: seen(10_000),
				series: receiving ? 277 : 0,
			},
			logs: {
				received: receiving,
				count: receiving ? 9_698 : 0,
				firstSeen: seen(3_000_000),
				lastSeen: seen(1_000),
			},
		},
	};
}

export const integrationsResponse = {
	status: 'success',
	data: {
		integrations: [
			{ id: 'builtin-redis', title: 'Redis', is_installed: true },
			{ id: 'builtin-postgres', title: 'PostgreSQL', is_installed: true },
			{ id: 'builtin-nginx', title: 'Nginx', is_installed: false },
		],
	},
};

export function connectionStatusResponse(receiving: boolean): unknown {
	return {
		status: 'success',
		data: receiving
			? {
					logs: {
						last_received_ts_ms: Date.now() - 30_000,
						last_received_from: 'redis',
					},
					metrics: {
						last_received_ts_ms: Date.now() - 20_000,
						last_received_from: 'redis',
					},
				}
			: { logs: null, metrics: null },
	};
}
