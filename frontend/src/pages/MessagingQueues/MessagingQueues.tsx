import { useEffect } from 'react';
import logEvent from 'api/common/logEvent';
import { useKafkaHealthChecks } from 'components/MessagingQueueHealthCheck/useKafkaHealthChecks';

import KafkaSetupPanel from './KafkaOverview/KafkaSetupPanel';
import KafkaViewCards from './KafkaOverview/KafkaViewCards';
import { MessagingQueueHealthCheckService } from './MessagingQueuesUtils';

const SERVICES = [
	MessagingQueueHealthCheckService.Consumers,
	MessagingQueueHealthCheckService.Producers,
	MessagingQueueHealthCheckService.Kafka,
];

function MessagingQueues(): JSX.Element {
	const { checks, isLoading } = useKafkaHealthChecks(SERVICES);

	useEffect(() => {
		void logEvent('Messaging Queues: Overview page visited', {});
	}, []);

	return (
		<div className="tw:flex tw:flex-col tw:gap-4" data-testid="kafka-overview">
			<KafkaSetupPanel checks={checks} isLoading={isLoading} />
			<KafkaViewCards checks={checks} />
		</div>
	);
}

export default MessagingQueues;
