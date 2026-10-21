import { fuseScopeDocsUrl } from 'constants/docs';

import {
	KAFKA_SETUP_DOC_LINKS,
	MessagingQueueHealthCheckService,
} from '../MessagingQueuesUtils';

describe('KAFKA_SETUP_DOC_LINKS', () => {
	it.each([
		[
			MessagingQueueHealthCheckService.Producers,
			'/analyze/messaging-queues/#instrument-kafka-producers-and-consumers',
		],
		[
			MessagingQueueHealthCheckService.Consumers,
			'/analyze/messaging-queues/#instrument-kafka-producers-and-consumers',
		],
		[
			MessagingQueueHealthCheckService.Kafka,
			'/analyze/messaging-queues/#collect-kafka-metrics',
		],
	])('sends the %s fix to %s', (service, path) => {
		expect(KAFKA_SETUP_DOC_LINKS[service]).toBe(fuseScopeDocsUrl(path));
	});
});
