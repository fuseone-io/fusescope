import { ENVIRONMENT } from 'constants/env';
import { getBaseUrl } from 'utils/basePath';

/** The FuseScope base URL the SDK sends to: the API's, else this UI's. */
export function sdkEndpoint(): string {
	return (ENVIRONMENT.baseURL || getBaseUrl()).replace(/\/+$/, '');
}
