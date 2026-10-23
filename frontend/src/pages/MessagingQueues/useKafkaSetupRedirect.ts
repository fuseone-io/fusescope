import { useCallback } from 'react';
import logEvent from 'api/common/logEvent';
import { openInNewTab } from 'utils/navigation';

import {
	KAFKA_SETUP_DOC_LINKS,
	MessagingQueueHealthCheckService,
} from './MessagingQueuesUtils';

/**
 * Opens the setup guidance for one part of the Kafka pipeline. `sourceCard`
 * logs the "Get started" analytics event; the health check's Fix omits it.
 */
export function useKafkaSetupRedirect(): (
	service: MessagingQueueHealthCheckService,
	options?: { sourceCard?: string; event?: React.MouseEvent },
) => void {
	return useCallback((service, { sourceCard } = {}): void => {
		const docLink = KAFKA_SETUP_DOC_LINKS[service];
		if (sourceCard) {
			void logEvent('Messaging Queues: Get started clicked', {
				source: sourceCard,
				link: docLink,
			});
		}
		openInNewTab(docLink);
	}, []);
}
