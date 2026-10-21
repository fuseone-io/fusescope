import {
	allOf,
	errorSpansFilter,
	metricErrorFilter,
	serviceFilter,
} from 'lib/apm/filters';
import {
	metricQuery,
	rangeRequest,
	RangeResponse,
	rawScalarRows,
	scalarRows,
	traceQuery,
} from 'lib/apm/queryRange';
import { NS_PER_MS, SPAN_METRIC } from 'lib/apm/spanMetrics';
import { ApmWindow } from 'lib/apm/window';
import { QueryEnvelope, QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import { AddressCall, PeerCall } from '../types';

const CLIENT = "kind_string IN ['Client', 'Producer']";
const SERVER = "kind_string = 'Server'";
const HOSTLESS_ADDRESS = "address NOT REGEXP '^(0[.]0[.]0[.]0)?(:[0-9]*)?$|:$'";

/** Resource attributes the node panel lists, in this order. */
export const RESOURCE_KEYS = [
	'service.version',
	'service.namespace',
	'deployment.environment',
	'telemetry.sdk.language',
	'telemetry.sdk.name',
	'telemetry.sdk.version',
	'host.name',
	'k8s.cluster.name',
	'k8s.namespace.name',
	'k8s.deployment.name',
];

export interface InferredCalls {
	peers: PeerCall[];
	addresses: AddressCall[];
	rpcSystems: Record<string, string>;
	dbSystems: string[];
	messagingSystems: string[];
}

const finite = (value: unknown): number => {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
};

const optional = (value: unknown): number | undefined => {
	const number = Number(value);
	return value === null || !Number.isFinite(number) ? undefined : number;
};

/**
 * What the dependency graph leaves out, in one request: the `rpc.system` of
 * SERVER spans for protocols, `peer.service` on client spans, external
 * addresses from span metrics, and the db/messaging systems seen.
 */
export function inferredCallsRequest(
	window: ApmWindow,
	resourceFilter: string,
): QueryRangeRequestV5 {
	const external = (name: string, where: string): QueryEnvelope =>
		metricQuery({
			name,
			filter: allOf(HOSTLESS_ADDRESS, where, resourceFilter),
			groupBy: ['service.name', 'address'],
			metric: SPAN_METRIC.externalCount,
			timeAggregation: 'rate',
			spaceAggregation: 'sum',
			reduceTo: 'avg',
		});
	const count = (
		name: string,
		filter: string,
		groupBy: string[],
	): QueryEnvelope =>
		traceQuery({
			name,
			filter: allOf(filter, resourceFilter),
			groupBy,
			aggregations: ['count()'],
		});
	return rangeRequest(window, 'scalar', [
		count('A', allOf(SERVER, 'rpc.system EXISTS'), [
			'service.name',
			'rpc.system',
		]),
		traceQuery({
			name: 'B',
			filter: allOf(CLIENT, 'peer.service EXISTS', resourceFilter),
			groupBy: ['service.name', 'peer.service'],
			aggregations: [
				'count()',
				`countIf(${errorSpansFilter})`,
				'p50(duration_nano)',
				'p95(duration_nano)',
				'p99(duration_nano)',
			],
		}),
		external('C', ''),
		external('D', metricErrorFilter),
		count('E', allOf(CLIENT, 'db.system EXISTS'), ['db.system']),
		count('F', 'messaging.system EXISTS', ['messaging.system']),
	]);
}

const distinct = (
	response: RangeResponse | undefined,
	query: string,
	key: string,
): string[] =>
	Array.from(
		new Set(
			rawScalarRows(response, query)
				.map((row) => row.labels[key])
				.filter(Boolean),
		),
	);

export function inferredCalls(
	response: RangeResponse | undefined,
): InferredCalls {
	const failed = new Map(
		scalarRows(response, 'D').map((row) => [
			`${row.labels['service.name']}>${row.labels.address}`,
			finite(row.values[0]),
		]),
	);
	return {
		rpcSystems: Object.fromEntries(
			rawScalarRows(response, 'A')
				.filter((row) => row.labels['rpc.system'])
				.map((row) => [row.labels['service.name'], row.labels['rpc.system']]),
		),
		peers: rawScalarRows(response, 'B')
			.filter((row) => row.labels['service.name'] && row.labels['peer.service'])
			.map((row) => ({
				caller: row.labels['service.name'],
				peer: row.labels['peer.service'],
				requests: finite(row.values[0]),
				errors: finite(row.values[1]),
				p50: optional(row.values[2]),
				p95: optional(row.values[3]),
				p99: optional(row.values[4]),
			})),
		addresses: scalarRows(response, 'C')
			.filter((row) => row.labels['service.name'] && row.labels.address)
			.map((row) => {
				const rate = finite(row.values[0]);
				const errors =
					failed.get(`${row.labels['service.name']}>${row.labels.address}`) ?? 0;
				return {
					caller: row.labels['service.name'],
					address: row.labels.address,
					rate,
					errorRate: rate > 0 ? Math.min(100, (errors / rate) * 100) : 0,
				};
			}),
		dbSystems: distinct(response, 'E', 'db.system'),
		messagingSystems: distinct(response, 'F', 'messaging.system'),
	};
}

/** The selected service's SERVER span percentiles and its resource attributes. */
export function nodeDetailsRequest(
	window: ApmWindow,
	servicename: string,
	resourceFilter: string,
): QueryRangeRequestV5 {
	const filter = allOf(serviceFilter(servicename), resourceFilter);
	return rangeRequest(window, 'scalar', [
		traceQuery({
			name: 'A',
			filter: allOf(filter, SERVER),
			aggregations: [
				'count()',
				'p50(duration_nano)',
				'p95(duration_nano)',
				'p99(duration_nano)',
			],
		}),
		traceQuery({
			name: 'B',
			filter,
			groupBy: RESOURCE_KEYS,
			aggregations: ['count()'],
			limit: 50,
		}),
	]);
}

export interface Percentiles {
	p50?: number;
	p95?: number;
	p99?: number;
}

export interface NodeDetails {
	/** ms; undefined without SERVER spans. */
	serverLatency?: Percentiles;
	attributes: [string, string[]][];
}

export function nodeDetails(response: RangeResponse | undefined): NodeDetails {
	const [server] = rawScalarRows(response, 'A');
	const ms = (value: unknown): number | undefined => {
		const number = optional(value);
		return number === undefined ? undefined : number / NS_PER_MS;
	};
	const rows = rawScalarRows(response, 'B');
	return {
		serverLatency:
			server && finite(server.values[0]) > 0
				? {
						p50: ms(server.values[1]),
						p95: ms(server.values[2]),
						p99: ms(server.values[3]),
					}
				: undefined,
		attributes: RESOURCE_KEYS.map((key): [string, string[]] => [
			key,
			Array.from(new Set(rows.map((row) => row.labels[key]).filter(Boolean))),
		]).filter(([, values]) => values.length > 0),
	};
}
