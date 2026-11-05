/** AI-owned. Generated and maintained by the signoz-page-story skill. */
import type { OnboardingtypesIngestionDTO } from 'api/generated/services/fuseScope.schemas';
import { OnboardingtypesIngestionSourceDTO } from 'api/generated/services/fuseScope.schemas';

export const RUM_COLLECTOR_STATES = [
	'configured',
	'unconfigured',
	'loading',
	'error',
] as const;
export type RumCollectorState = (typeof RUM_COLLECTOR_STATES)[number];

export function rumIngestion(configured: boolean): OnboardingtypesIngestionDTO {
	return {
		otlpHttpEndpoint: configured
			? 'https://ingest.example.com'
			: 'http://localhost:4318',
		otlpGrpcEndpoint: configured ? 'ingest.example.com:443' : 'localhost:4317',
		otlpGrpcInsecure: !configured,
		source: configured
			? OnboardingtypesIngestionSourceDTO.config
			: OnboardingtypesIngestionSourceDTO.derived,
		derived: !configured,
		authRequired: false,
		organizationUrl: null,
		configUrl: configured ? 'https://ingest.example.com' : null,
		collector: null,
	};
}
