import { serviceSignals, serviceSignalsRequest } from '../serviceSignals';

const result = (
	queryName: string,
	groups: string[],
	rows: unknown[][],
): unknown => ({
	queryName,
	columns: [
		...groups.map((name) => ({ name, queryName, columnType: 'group' })),
		{
			name: '__result_0',
			queryName,
			aggregationIndex: 0,
			columnType: 'aggregation',
		},
	],
	data: rows,
});

describe('serviceSignalsRequest', () => {
	it('counts each signal per service in one scalar request', () => {
		const request = serviceSignalsRequest(
			{ start: 0, end: 1, seconds: 1, step: 60 },
			"deployment.environment in ['dev']",
		);
		expect(request.requestType).toBe('scalar');
		expect(request.compositeQuery.queries).toHaveLength(7);
		expect(
			(
				request.compositeQuery.queries[1].spec as { filter: { expression: string } }
			).filter.expression,
		).toBe(
			"kind_string = 'Server' AND rpc.method EXISTS AND deployment.environment in ['dev']",
		);
	});
});

describe('serviceSignals', () => {
	it('collects the signals by service', () => {
		const signals = serviceSignals({
			data: {
				results: [
					result(
						'A',
						['service.name', 'telemetry.sdk.language'],
						[
							['driver', 'go', 1330],
							['payment', null, 1794],
						],
					),
					result('B', ['service.name'], [['driver', 1330]]),
					result('F', ['service.name'], [['driver', 1330]]),
					result('G', ['peer.service'], [['mysql', 1330]]),
				],
			},
		});
		expect(signals).toStrictEqual({
			driver: { language: 'go', rpcServerSpans: 1330, serverSpans: 1330 },
			payment: { language: undefined },
			mysql: { databasePeer: true },
		});
	});
});
