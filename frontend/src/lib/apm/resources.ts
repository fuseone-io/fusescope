import { RangeResponse, rawScalarRows, scalarRows } from './queryRange';
import { NS_PER_MS } from './spanMetrics';
import { ApmWindow } from './window';

export interface ServiceHost {
	name: string;
	requests: number;
	rate: number;
	errorRate: number;
	/** ms */
	p99: number;
	/** Share of the service's requests served by this host, 0–100. */
	share: number;
	/** Epoch ms of the host's latest request. */
	lastSeen?: number;
}

export interface ServiceResources {
	hosts: ServiceHost[];
	environments: string[];
	languages: string[];
}

const finite = (value: unknown): number => {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
};

/** Hosts (by `host.name`), environments and SDK languages behind the service's requests. */
export function serviceResources(
	response: RangeResponse | undefined,
	window: ApmWindow,
): ServiceResources {
	const rows = rawScalarRows(response, 'A').filter(
		(row) => row.labels['host.name'],
	);
	const total = rows.reduce((sum, row) => sum + finite(row.values[0]), 0);
	const hosts = rows
		.map((row): ServiceHost => {
			const requests = finite(row.values[0]);
			const seen = row.values[3];
			const lastSeen = typeof seen === 'string' ? Date.parse(seen) : Number.NaN;
			return {
				name: row.labels['host.name'],
				requests,
				rate: requests / window.seconds,
				errorRate: requests > 0 ? (finite(row.values[1]) / requests) * 100 : 0,
				p99: finite(row.values[2]) / NS_PER_MS,
				share: total > 0 ? (requests / total) * 100 : 0,
				lastSeen: Number.isNaN(lastSeen) ? undefined : lastSeen,
			};
		})
		.sort((a, b) => b.requests - a.requests);

	const meta = scalarRows(response, 'B').sort(
		(a, b) => b.values[0] - a.values[0],
	);
	const distinct = (key: string): string[] =>
		Array.from(new Set(meta.map((row) => row.labels[key]).filter(Boolean)));

	return {
		hosts,
		environments: distinct('deployment.environment'),
		languages: distinct('telemetry.sdk.language'),
	};
}
