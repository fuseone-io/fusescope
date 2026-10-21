import { SortState } from 'components/PageTemplate/types';
import { ScalarData } from 'types/api/v5/queryRange';

import { SPAN_ATTRIBUTES } from './Explorer/Domains/DomainDetails/constants';
import { APIDomainsRowData } from './types';

export type ErrorRateTone = 'success' | 'warning' | 'error';

/** At or above this error share a domain reads as failing. */
export const ERROR_RATE_CRITICAL = 5;

export interface DomainRow {
	domain: string;
	endpoints: number | undefined;
	rate: number | undefined;
	errorRate: number | undefined;
	p99Ms: number | undefined;
	lastUsedMs: number | undefined;
	isIp: boolean;
}

export type DomainSortKey =
	| 'endpoints'
	| 'lastUsedMs'
	| 'rate'
	| 'errorRate'
	| 'p99Ms';

export function errorRateTone(percent: number): ErrorRateTone {
	if (percent >= ERROR_RATE_CRITICAL) {
		return 'error';
	}
	return percent > 0 ? 'warning' : 'success';
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
const IPV6 = /^\[?[0-9a-f]*:[0-9a-f:]+\]?(:\d+)?$/i;

export function isIpAddress(domain: string): boolean {
	return (
		IPV4.test(domain) || (IPV6.test(domain) && domain.split(':').length > 2)
	);
}

function toNumber(value: unknown): number | undefined {
	if (value === '' || value === '-' || value === 'n/a' || value === undefined) {
		return undefined;
	}
	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
}

function toTime(value: string): number | undefined {
	const time = Date.parse(value);
	return Number.isNaN(time) ? undefined : time;
}

export function toDomainRow(row: APIDomainsRowData): DomainRow {
	return {
		domain: row.domainName,
		endpoints: toNumber(row.endpointCount),
		rate: toNumber(row.rate),
		errorRate: toNumber(row.errorRate),
		p99Ms: toNumber(row.latency),
		lastUsedMs: toTime(row.lastUsed),
		isIp: isIpAddress(row.domainName),
	};
}

export function sortDomains(
	rows: DomainRow[],
	{ key, direction }: SortState<DomainSortKey>,
): DomainRow[] {
	const sign = direction === 'asc' ? 1 : -1;
	return [...rows].sort((a, b) => {
		const left = a[key];
		const right = b[key];
		if (left === undefined || right === undefined) {
			if (left !== right) {
				return left === undefined ? 1 : -1;
			}
		} else if (left !== right) {
			return (left - right) * sign;
		}
		return (b.rate ?? 0) - (a.rate ?? 0);
	});
}

/** Calling services per domain from a count grouped by host and service. */
export function callersByDomain(
	result: ScalarData | undefined,
): Map<string, string[]> {
	const callers = new Map<string, string[]>();
	if (!result?.data) {
		return callers;
	}
	const index = (name: string): number =>
		result.columns.findIndex((column) => column.name === name);
	const host = index(SPAN_ATTRIBUTES.SERVER_NAME);
	const service = index('service.name');
	const count = result.columns.findIndex(
		(column) => column.columnType === 'aggregation',
	);
	if (host < 0 || service < 0) {
		return callers;
	}

	const sorted = [...result.data].sort(
		(a, b) => Number(b[count] ?? 0) - Number(a[count] ?? 0),
	);
	sorted.forEach((row) => {
		const domain = String(row[host] ?? '');
		const name = String(row[service] ?? '');
		if (!domain || !name) {
			return;
		}
		callers.set(domain, [...(callers.get(domain) ?? []), name]);
	});
	return callers;
}

export function domainNeighbours(
	domains: string[],
	domain: string,
): { previous: string | undefined; next: string | undefined } {
	const index = domains.indexOf(domain);
	if (index < 0) {
		return { previous: undefined, next: undefined };
	}
	return { previous: domains[index - 1], next: domains[index + 1] };
}

/** Latency in milliseconds at every magnitude, so rows compare at a glance. */
export function formatMs(ms: number | undefined): string {
	if (ms === undefined || !Number.isFinite(ms)) {
		return '—';
	}
	if (ms === 0 || ms >= 10) {
		return `${Math.round(ms).toLocaleString('en-US')} ms`;
	}
	return `${Number(ms.toPrecision(2))} ms`;
}
