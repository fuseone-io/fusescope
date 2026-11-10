import { ENVIRONMENT } from 'constants/env';
import { getBaseUrl } from 'utils/basePath';

/** API and self-hosted bundle URL; ingest uses the configured collector URL. */
export function managementEndpoint(): string {
	return (ENVIRONMENT.baseURL || getBaseUrl()).replace(/\/+$/, '');
}
