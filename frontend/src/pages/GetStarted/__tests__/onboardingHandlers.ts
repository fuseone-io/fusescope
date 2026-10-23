import { rest, server } from 'mocks-server/server';

export const INGESTION = {
	otlpHttpEndpoint: 'https://otlp.example.com',
	otlpGrpcEndpoint: 'otlp.example.com:4317',
	otlpGrpcInsecure: false,
	source: 'organization',
	derived: false,
	authRequired: false,
	organizationUrl: 'https://otlp.example.com',
	configUrl: null,
	collector: { endpoint: 'http://localhost:4318', reachable: true },
};

export function receivingStatus(service: string | null): unknown {
	const now = Date.now();
	return {
		since: now - 3_600_000,
		until: now,
		service,
		traces: {
			received: true,
			count: 214,
			firstSeen: now - 60_000,
			lastSeen: now - 2_000,
			operations: 12,
		},
		metrics: {
			received: true,
			count: 900,
			firstSeen: now - 60_000,
			lastSeen: now - 10_000,
			series: 86,
		},
		logs: {
			received: true,
			count: 57,
			firstSeen: now - 60_000,
			lastSeen: now - 1_000,
		},
	};
}

export function waitingStatus(service: string | null): unknown {
	const now = Date.now();
	return {
		since: now - 3_600_000,
		until: now,
		service,
		traces: {
			received: false,
			count: 0,
			firstSeen: null,
			lastSeen: null,
			operations: 0,
		},
		metrics: {
			received: false,
			count: 0,
			firstSeen: null,
			lastSeen: null,
			series: 0,
		},
		logs: { received: false, count: 0, firstSeen: null, lastSeen: null },
	};
}

interface HandlerOptions {
	status?: (service: string | null) => unknown;
}

export function onboardingHandlers({
	status = receivingStatus,
}: HandlerOptions = {}): ReturnType<typeof rest.get>[] {
	return [
		rest.get('*/api/v1/onboarding/ingestion', (_req, res, ctx) =>
			res(ctx.json({ status: 'success', data: INGESTION })),
		),
		rest.get('*/api/v1/onboarding/status', (req, res, ctx) =>
			res(
				ctx.json({
					status: 'success',
					data: status(req.url.searchParams.get('service')),
				}),
			),
		),
		rest.get('*/api/v1/integrations', (_req, res, ctx) =>
			res(
				ctx.json({
					status: 'success',
					data: {
						integrations: [
							{ id: 'builtin-redis', title: 'Redis', is_installed: true },
							{ id: 'builtin-nginx', title: 'Nginx', is_installed: true },
							{ id: 'builtin-mongo', title: 'Mongo', is_installed: false },
						],
					},
				}),
			),
		),
		rest.get('*/api/v1/integrations/:id/connection_status', (req, res, ctx) =>
			res(
				ctx.json({
					status: 'success',
					data:
						req.params.id === 'builtin-redis'
							? {
									logs: null,
									metrics: {
										last_received_ts_ms: Date.now() - 60_000,
										last_received_from: 'redis',
									},
								}
							: { logs: null, metrics: null },
				}),
			),
		),
	];
}

/** Paths of every request the mock server sees from now on. */
export function recordRequests(): () => string[] {
	const paths: string[] = [];
	server.events.on('request:start', (req) => {
		paths.push(req.url.pathname);
	});
	return (): string[] => paths;
}
