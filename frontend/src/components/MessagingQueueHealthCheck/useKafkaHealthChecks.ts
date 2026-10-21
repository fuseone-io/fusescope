import { OnboardingStatusResponse } from 'api/messagingQueues/onboarding/getOnboardingStatus';
import { useOnboardingStatus } from 'hooks/messagingQueue/useOnboardingStatus';
import {
	KafkaChecks,
	summarizeCheck,
} from 'pages/MessagingQueues/kafkaReadiness';
import { MessagingQueueHealthCheckService } from 'pages/MessagingQueues/MessagingQueuesUtils';

export interface ServiceHealthResponse {
	service: MessagingQueueHealthCheckService;
	title: string;
	data: OnboardingStatusResponse['data'];
	errorMsg?: string;
}

export interface KafkaHealthChecks {
	responses: ServiceHealthResponse[];
	checks: KafkaChecks;
	/** No answer yet from at least one check. */
	isLoading: boolean;
	isFetching: boolean;
}

const TITLES: Record<MessagingQueueHealthCheckService, string> = {
	[MessagingQueueHealthCheckService.Producers]: 'Producers',
	[MessagingQueueHealthCheckService.Consumers]: 'Consumers',
	[MessagingQueueHealthCheckService.Kafka]: 'Kafka',
};

function useServiceCheck(
	service: MessagingQueueHealthCheckService,
	enabled: boolean,
): {
	response: ServiceHealthResponse;
	isLoading: boolean;
	isFetching: boolean;
} {
	const { data, error, isLoading, isFetching } = useOnboardingStatus(
		{ enabled },
		service,
	);
	const errorMsg = (error || data?.error) as string | undefined;
	return {
		response: {
			service,
			title: TITLES[service],
			data: data?.payload?.data || [],
			errorMsg: errorMsg || undefined,
		},
		isLoading: enabled && isLoading,
		isFetching,
	};
}

/** The three Kafka onboarding checks; react-query shares them across callers. */
export function useKafkaHealthChecks(
	services: MessagingQueueHealthCheckService[],
): KafkaHealthChecks {
	const producers = useServiceCheck(
		MessagingQueueHealthCheckService.Producers,
		services.includes(MessagingQueueHealthCheckService.Producers),
	);
	const consumers = useServiceCheck(
		MessagingQueueHealthCheckService.Consumers,
		services.includes(MessagingQueueHealthCheckService.Consumers),
	);
	const kafka = useServiceCheck(
		MessagingQueueHealthCheckService.Kafka,
		services.includes(MessagingQueueHealthCheckService.Kafka),
	);

	const all = [producers, consumers, kafka];
	const toCheck = ({
		response,
		isLoading,
	}: typeof producers): KafkaChecks[MessagingQueueHealthCheckService] =>
		summarizeCheck({
			isLoading,
			data: response.data,
			error: response.errorMsg,
		});

	return {
		responses: all
			.map(({ response }) => response)
			.filter(({ service }) => services.includes(service)),
		checks: {
			[MessagingQueueHealthCheckService.Producers]: toCheck(producers),
			[MessagingQueueHealthCheckService.Consumers]: toCheck(consumers),
			[MessagingQueueHealthCheckService.Kafka]: toCheck(kafka),
		},
		isLoading: all.some(({ isLoading }) => isLoading),
		isFetching: all.some(({ isFetching }) => isFetching),
	};
}
