import {
	countAttributes,
	getSetupSteps,
	getViewReadiness,
	KafkaChecks,
	summarizeCheck,
} from '../kafkaReadiness';
import {
	MessagingQueueHealthCheckService,
	MessagingQueuesViewTypeOptions,
} from '../MessagingQueuesUtils';

const ready = { status: 'ready' } as const;
const missing = { status: 'missing', missing: 1 } as const;

const checks = (overrides: Partial<KafkaChecks>): KafkaChecks => ({
	[MessagingQueueHealthCheckService.Producers]: ready,
	[MessagingQueueHealthCheckService.Consumers]: ready,
	[MessagingQueueHealthCheckService.Kafka]: ready,
	...overrides,
});

describe('summarizeCheck', () => {
	it.each([
		['loading', { isLoading: true, data: undefined }, { status: 'loading' }],
		[
			'request failed',
			{ isLoading: false, data: undefined, error: 'boom' },
			{ status: 'error' },
		],
		[
			'all attributes found',
			{
				isLoading: false,
				data: [
					{ attribute: 'kind', status: '1' },
					{ attribute: 'messaging.system', status: '1' },
				],
			},
			{ status: 'ready' },
		],
		[
			'some attributes missing',
			{
				isLoading: false,
				data: [
					{ attribute: 'kind', status: '1' },
					{ attribute: 'messaging.system', status: '0' },
					{ attribute: 'messaging.destination.name', status: '0' },
				],
			},
			{ status: 'missing', missing: 2 },
		],
		[
			'no data reported',
			{ isLoading: false, data: [] },
			{ status: 'missing', missing: 0 },
		],
	])('%s', (_name, input, expected) => {
		expect(summarizeCheck(input)).toStrictEqual(expected);
	});
});

describe('countAttributes', () => {
	it('counts found and missing attributes across services', () => {
		expect(
			countAttributes([
				[
					{ attribute: 'a', status: '1' },
					{ attribute: 'b', status: '0' },
				],
				[{ attribute: 'c', status: '0' }, { status: '0' }],
				[],
			]),
		).toStrictEqual({ all: 3, missing: 2, found: 1 });
	});
});

describe('getSetupSteps', () => {
	it.each([
		[
			'nothing set up',
			checks({
				producers: missing,
				consumers: missing,
				kafka: missing,
			}),
			[false, false, false],
			0,
		],
		[
			'producers only',
			checks({ consumers: missing, kafka: missing }),
			[true, false, false],
			1,
		],
		['everything', checks({}), [true, true, true], 3],
		[
			'still loading counts as not done',
			checks({ kafka: { status: 'loading' } }),
			[true, true, false],
			2,
		],
	])('%s', (_name, input, done, doneCount) => {
		const { steps, doneCount: count } = getSetupSteps(input);
		expect(steps.map((step) => step.service)).toStrictEqual([
			MessagingQueueHealthCheckService.Producers,
			MessagingQueueHealthCheckService.Consumers,
			MessagingQueueHealthCheckService.Kafka,
		]);
		expect(steps.map((step) => step.done)).toStrictEqual(done);
		expect(count).toBe(doneCount);
	});
});

describe('getViewReadiness', () => {
	it.each([
		[
			MessagingQueuesViewTypeOptions.ConsumerLag,
			checks({ kafka: missing }),
			{ tone: 'missing', label: 'Needs Kafka receiver metrics' },
		],
		[
			MessagingQueuesViewTypeOptions.ConsumerLag,
			checks({ consumers: missing }),
			{ tone: 'ready', label: 'Ready' },
		],
		[
			MessagingQueuesViewTypeOptions.PartitionLatency,
			checks({ consumers: missing }),
			{ tone: 'missing', label: 'Needs consumer spans' },
		],
		[
			MessagingQueuesViewTypeOptions.PartitionLatency,
			checks({ producers: missing, consumers: missing }),
			{ tone: 'missing', label: 'Needs producer and consumer spans' },
		],
		[
			MessagingQueuesViewTypeOptions.ProducerLatency,
			checks({ consumers: missing, kafka: missing }),
			{ tone: 'ready', label: 'Ready' },
		],
		[
			MessagingQueuesViewTypeOptions.ProducerLatency,
			checks({ producers: missing }),
			{ tone: 'missing', label: 'Needs producer spans' },
		],
		[
			MessagingQueuesViewTypeOptions.DropRate,
			checks({ producers: missing }),
			{ tone: 'missing', label: 'Needs producer spans' },
		],
		[
			MessagingQueuesViewTypeOptions.MetricPage,
			checks({}),
			{ tone: 'ready', label: 'Ready' },
		],
		[
			MessagingQueuesViewTypeOptions.MetricPage,
			checks({ kafka: { status: 'loading' } }),
			{ tone: 'unknown', label: 'Checking setup…' },
		],
		[
			MessagingQueuesViewTypeOptions.DropRate,
			checks({ consumers: { status: 'error' } }),
			{ tone: 'unknown', label: 'Setup check failed' },
		],
		[
			MessagingQueuesViewTypeOptions.DropRate,
			checks({ consumers: { status: 'error' }, producers: missing }),
			{ tone: 'missing', label: 'Needs producer spans' },
		],
	])('%s', (view, input, expected) => {
		expect(getViewReadiness(view, input)).toStrictEqual(expected);
	});
});
