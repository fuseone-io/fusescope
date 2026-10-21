import { OnboardingStatusResponse } from 'api/messagingQueues/onboarding/getOnboardingStatus';

import {
	MessagingQueueHealthCheckService,
	MessagingQueuesViewTypeOptions,
} from './MessagingQueuesUtils';

type OnboardingAttributes = OnboardingStatusResponse['data'];

export type KafkaCheck =
	| { status: 'loading' }
	| { status: 'error' }
	| { status: 'ready' }
	| { status: 'missing'; missing: number };

export type KafkaChecks = Record<MessagingQueueHealthCheckService, KafkaCheck>;

export interface SetupStep {
	service: MessagingQueueHealthCheckService;
	done: boolean;
}

export interface ViewReadiness {
	tone: 'ready' | 'missing' | 'unknown';
	label: string;
}

const isMissing = (item: OnboardingAttributes[number]): boolean =>
	!!item.attribute && item.status === '0';

export function summarizeCheck({
	isLoading,
	data,
	error,
}: {
	isLoading: boolean;
	data?: OnboardingAttributes;
	error?: unknown;
}): KafkaCheck {
	if (isLoading) {
		return { status: 'loading' };
	}
	if (error || !data) {
		return { status: 'error' };
	}
	const missing = data.filter(isMissing).length;
	if (data.length > 0 && missing === 0) {
		return { status: 'ready' };
	}
	return { status: 'missing', missing };
}

export function countAttributes(lists: OnboardingAttributes[]): {
	all: number;
	missing: number;
	found: number;
} {
	const attributes = lists.flat().filter((item) => !!item.attribute);
	const missing = attributes.filter(isMissing).length;
	return { all: attributes.length, missing, found: attributes.length - missing };
}

const SETUP_ORDER = [
	MessagingQueueHealthCheckService.Producers,
	MessagingQueueHealthCheckService.Consumers,
	MessagingQueueHealthCheckService.Kafka,
];

export function getSetupSteps(checks: KafkaChecks): {
	steps: SetupStep[];
	doneCount: number;
} {
	const steps = SETUP_ORDER.map((service) => ({
		service,
		done: checks[service].status === 'ready',
	}));
	return { steps, doneCount: steps.filter((step) => step.done).length };
}

export const VIEW_REQUIREMENTS: Record<
	MessagingQueuesViewTypeOptions,
	MessagingQueueHealthCheckService[]
> = {
	[MessagingQueuesViewTypeOptions.ConsumerLag]: [
		MessagingQueueHealthCheckService.Kafka,
	],
	[MessagingQueuesViewTypeOptions.PartitionLatency]: [
		MessagingQueueHealthCheckService.Producers,
		MessagingQueueHealthCheckService.Consumers,
	],
	[MessagingQueuesViewTypeOptions.ProducerLatency]: [
		MessagingQueueHealthCheckService.Producers,
	],
	[MessagingQueuesViewTypeOptions.DropRate]: [
		MessagingQueueHealthCheckService.Producers,
		MessagingQueueHealthCheckService.Consumers,
	],
	[MessagingQueuesViewTypeOptions.MetricPage]: [
		MessagingQueueHealthCheckService.Kafka,
	],
};

function needsLabel(services: MessagingQueueHealthCheckService[]): string {
	const spans = [
		services.includes(MessagingQueueHealthCheckService.Producers) && 'producer',
		services.includes(MessagingQueueHealthCheckService.Consumers) && 'consumer',
	].filter(Boolean);
	const parts = [
		spans.length > 0 && `${spans.join(' and ')} spans`,
		services.includes(MessagingQueueHealthCheckService.Kafka) &&
			'Kafka receiver metrics',
	].filter(Boolean);
	return `Needs ${parts.join(' and ')}`;
}

export function getViewReadiness(
	view: MessagingQueuesViewTypeOptions,
	checks: KafkaChecks,
): ViewReadiness {
	const required = VIEW_REQUIREMENTS[view];
	const missing = required.filter(
		(service) => checks[service].status === 'missing',
	);
	if (missing.length > 0) {
		return { tone: 'missing', label: needsLabel(missing) };
	}
	if (required.some((service) => checks[service].status === 'loading')) {
		return { tone: 'unknown', label: 'Checking setup…' };
	}
	if (required.some((service) => checks[service].status === 'error')) {
		return { tone: 'unknown', label: 'Setup check failed' };
	}
	return { tone: 'ready', label: 'Ready' };
}
