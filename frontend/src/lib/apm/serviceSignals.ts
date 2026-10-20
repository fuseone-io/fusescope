import { QueryEnvelope, QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import { allOf } from './filters';
import {
	rangeRequest,
	RangeResponse,
	rawScalarRows,
	traceQuery,
} from './queryRange';
import { ServiceKindInfo } from './serviceKind';
import { ApmWindow } from './window';

export interface ServiceSignals extends Omit<ServiceKindInfo, 'name'> {
	language?: string;
}

const SERVER = "kind_string = 'Server'";

const COUNTS: [string, string][] = [
	['B', `${SERVER} AND rpc.method EXISTS`],
	['C', `${SERVER} AND (http.route EXISTS OR http.method EXISTS)`],
	['D', 'db.system EXISTS'],
	['E', 'messaging.system EXISTS'],
	['F', SERVER],
];

/** One request with every service's span signals for its type icon and SDK language. */
export function serviceSignalsRequest(
	window: ApmWindow,
	resourceFilter: string,
): QueryRangeRequestV5 {
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
		count('A', '', ['service.name', 'telemetry.sdk.language']),
		...COUNTS.map(([name, filter]) => count(name, filter, ['service.name'])),
		count(
			'G',
			'peer.service EXISTS AND (db.system EXISTS OR db.statement EXISTS OR sql.query EXISTS)',
			['peer.service'],
		),
	]);
}

const numberOf = (value: unknown): number => {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
};

/** Signals by service name. */
export function serviceSignals(
	response: RangeResponse | undefined,
): Record<string, ServiceSignals> {
	const signals: Record<string, ServiceSignals> = {};
	const of = (name: string): ServiceSignals => {
		signals[name] = signals[name] ?? {};
		return signals[name];
	};
	rawScalarRows(response, 'A').forEach((row) => {
		const entry = of(row.labels['service.name']);
		entry.language =
			entry.language || row.labels['telemetry.sdk.language'] || undefined;
	});
	const fields: Record<string, keyof ServiceSignals> = {
		B: 'rpcServerSpans',
		C: 'httpServerSpans',
		D: 'dbSpans',
		E: 'messagingSpans',
		F: 'serverSpans',
	};
	Object.entries(fields).forEach(([query, field]) => {
		rawScalarRows(response, query).forEach((row) => {
			Object.assign(of(row.labels['service.name']), {
				[field]: numberOf(row.values[0]),
			});
		});
	});
	rawScalarRows(response, 'G').forEach((row) => {
		of(row.labels['peer.service']).databasePeer = true;
	});
	delete signals[''];
	return signals;
}
