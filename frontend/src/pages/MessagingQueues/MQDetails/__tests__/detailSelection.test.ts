import { getDetailSelection } from '../detailSelection';

const formatTime = (ms: number): string => `t${ms}`;

describe('getDetailSelection', () => {
	it.each([
		[
			'consumer lag point',
			{
				isConsumerLag: true,
				timeline: {
					group: 'orders-cg',
					topic: 'orders',
					partition: '2',
					start: 100,
					end: 200,
				},
				config: { topic: 'ignored' },
			},
			['orders-cg', 'orders', 'partition 2', 't100–t200'],
		],
		[
			'consumer lag point without a group',
			{
				isConsumerLag: true,
				timeline: { topic: 'orders', start: 100, end: 200 },
				config: {},
			},
			['orders', 't100–t200'],
		],
		[
			'partition row',
			{
				isConsumerLag: false,
				timeline: {},
				config: { topic: 'orders', partition: '0' },
			},
			['orders', 'partition 0'],
		],
		[
			'producer row',
			{
				isConsumerLag: false,
				timeline: {},
				config: { service_name: 'checkout', topic: 'orders' },
			},
			['checkout', 'orders'],
		],
	])('%s', (_name, input, expected) => {
		expect(getDetailSelection({ ...input, formatTime })).toStrictEqual(expected);
	});
});
