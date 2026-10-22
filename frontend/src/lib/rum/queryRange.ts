import { TraceQuerySpec, traceQuery } from 'lib/apm/queryRange';
import { QueryEnvelope } from 'types/api/v5/queryRange';

/** `traceQuery` over the logs signal: RUM events and errors are log records. */
export function logQuery(spec: TraceQuerySpec): QueryEnvelope {
	const query = traceQuery(spec);
	return { ...query, spec: { ...query.spec, signal: 'logs' } } as QueryEnvelope;
}

/** Epoch ms from a scalar cell: traces return ISO strings, logs nanoseconds. */
export function timestampMs(value: unknown): number | undefined {
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
		const number = Number(value);
		return Number.isFinite(number) && number > 0 ? number / 1e6 : undefined;
	}
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return value > 1e15 ? value / 1e6 : value;
	}
	return undefined;
}

export function numberCell(value: unknown): number {
	const number = Number(value);
	return value === null || value === undefined || !Number.isFinite(number)
		? Number.NaN
		: number;
}

/** Orders a scalar query by one of its aggregation expressions. */
export function orderedBy(
	query: QueryEnvelope,
	expression: string,
	direction: 'asc' | 'desc',
): QueryEnvelope {
	return {
		...query,
		spec: { ...query.spec, order: [{ key: { name: expression }, direction }] },
	} as QueryEnvelope;
}
