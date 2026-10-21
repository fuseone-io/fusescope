import { RangeResponse } from 'lib/apm/queryRange';
import { apmWindow } from 'lib/apm/window';

import {
	inferredCalls,
	inferredCallsRequest,
	nodeDetails,
	nodeDetailsRequest,
} from '../utils/requests';

function scalar(
	queryName: string,
	groups: string[],
	aggregations: number,
	data: unknown[][],
): unknown {
	return {
		queryName,
		columns: [
			...groups.map((name) => ({ name, queryName, columnType: 'group' })),
			...Array.from({ length: aggregations }, (_, index) => ({
				name: `__result_${index}`,
				queryName,
				aggregationIndex: index,
				columnType: 'aggregation',
			})),
		],
		data,
	};
}

const response = (...results: unknown[]): RangeResponse => ({
	data: { results },
});

const window = apmWindow(0, 3600 * 1e9);

describe('inferredCallsRequest', () => {
	it('asks for protocols, peers, addresses and systems under the page filter', () => {
		const request = inferredCallsRequest(
			window,
			"deployment.environment = 'dev'",
		);
		const queries = request.compositeQuery.queries.map(
			(query) => query.spec as { name: string; filter: { expression: string } },
		);
		expect(queries.map((query) => query.name)).toStrictEqual([
			'A',
			'B',
			'C',
			'D',
			'E',
			'F',
		]);
		queries.forEach((query) =>
			expect(query.filter.expression).toContain("deployment.environment = 'dev'"),
		);
	});
});

describe('inferredCalls', () => {
	it('reads every part of the response', () => {
		const calls = inferredCalls(
			response(
				scalar('A', ['service.name', 'rpc.system'], 1, [['driver', 'grpc', 10]]),
				scalar('B', ['service.name', 'peer.service'], 5, [
					['payment', 'telemetrygen-server', 600, 600, 5e8, 5e8, 5e8],
					['orphan', null, 1, 0, null, null, null],
				]),
				scalar('C', ['service.name', 'address'], 1, [
					['payment', '1.2.3.4', 0.2],
					['frontend', 'api.example.com', 0.5],
				]),
				scalar('D', ['service.name', 'address'], 1, [['payment', '1.2.3.4', 0.2]]),
				scalar('E', ['db.system'], 1, [['postgresql', 3]]),
				scalar('F', ['messaging.system'], 1, [['kafka', 2]]),
			),
		);
		expect(calls).toStrictEqual({
			rpcSystems: { driver: 'grpc' },
			peers: [
				{
					caller: 'payment',
					peer: 'telemetrygen-server',
					requests: 600,
					errors: 600,
					p50: 5e8,
					p95: 5e8,
					p99: 5e8,
				},
			],
			addresses: [
				{ caller: 'payment', address: '1.2.3.4', rate: 0.2, errorRate: 100 },
				{ caller: 'frontend', address: 'api.example.com', rate: 0.5, errorRate: 0 },
			],
			dbSystems: ['postgresql'],
			messagingSystems: ['kafka'],
		});
	});

	it('is empty before the response arrives', () => {
		expect(inferredCalls(undefined)).toStrictEqual({
			rpcSystems: {},
			peers: [],
			addresses: [],
			dbSystems: [],
			messagingSystems: [],
		});
	});
});

describe('nodeDetails', () => {
	it('reads SERVER percentiles in ms and distinct resource values', () => {
		expect(
			nodeDetailsRequest(window, 'driver', '').compositeQuery.queries,
		).toHaveLength(2);
		const details = nodeDetails(
			response(
				scalar('A', [], 4, [[10, 1e6, 5e6, 2e7]]),
				scalar('B', ['deployment.environment', 'host.name', 'service.version'], 1, [
					['dev', 'host-a', null, 5],
					['dev', 'host-b', null, 5],
				]),
			),
		);
		expect(details.serverLatency).toStrictEqual({ p50: 1, p95: 5, p99: 20 });
		expect(details.attributes).toStrictEqual([
			['deployment.environment', ['dev']],
			['host.name', ['host-a', 'host-b']],
		]);
	});

	it('has no SERVER latency for a service without SERVER spans', () => {
		expect(
			nodeDetails(response(scalar('A', [], 4, [[0, null, null, null]])))
				.serverLatency,
		).toBeUndefined();
	});
});
