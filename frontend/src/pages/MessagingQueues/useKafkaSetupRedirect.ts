import { useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { isModifierKeyPressed } from 'utils/app';
import { openInNewTab } from 'utils/navigation';

import {
	KAFKA_SETUP_DOC_LINKS,
	MessagingQueueHealthCheckService,
} from './MessagingQueuesUtils';

const cloudSetupLink = (service: MessagingQueueHealthCheckService): string =>
	`${ROUTES.GET_STARTED_WITH_CLOUD}?${QueryParams.getStartedSource}=self-hosted-kafka&${QueryParams.getStartedSourceService}=${service}`;

/**
 * Opens the setup guidance for one part of the Kafka pipeline. `sourceCard`
 * logs the "Get started" analytics event; the health check's Fix omits it.
 */
export function useKafkaSetupRedirect(): (
	service: MessagingQueueHealthCheckService,
	options?: { sourceCard?: string; event?: React.MouseEvent },
) => void {
	const history = useHistory();
	const { isCloudUser } = useGetTenantLicense();

	return useCallback(
		(service, { sourceCard, event } = {}): void => {
			const link = cloudSetupLink(service);
			const docLink = KAFKA_SETUP_DOC_LINKS[service];
			if (sourceCard) {
				void logEvent('Messaging Queues: Get started clicked', {
					source: sourceCard,
					link: isCloudUser ? link : docLink,
				});
			}
			if (!isCloudUser) {
				openInNewTab(docLink);
			} else if (event && isModifierKeyPressed(event)) {
				openInNewTab(link);
			} else {
				history.push(link);
			}
		},
		[history, isCloudUser],
	);
}
