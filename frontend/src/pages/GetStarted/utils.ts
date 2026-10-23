import type {
	OnboardingtypesIngestionDTO,
	OnboardingtypesStatusDTO,
} from 'api/generated/services/fuseScope.schemas';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatCount } from 'lib/apm/format';
import type { IntegrationConnectionStatus } from 'types/api/integrations/types';

import type {
	CatalogEntry,
	CatalogFilter,
	CatalogLink,
	CatalogSection,
	SignalSummary,
} from './types';
import type { OtlpEndpoints } from './guides/types';

dayjs.extend(relativeTime);

export function docsPageUrl(slug: string): string {
	const [page, anchor] = slug.split('#');
	const hash = anchor ? `#${anchor}` : '';
	return fuseScopeDocsUrl(`/${page}/${hash}`);
}

export function guideRoute(guideId: string): string {
	return ROUTES.GET_STARTED_GUIDE.replace(':guideId', guideId);
}

/** In-app guide first, then an in-app page, then the docs. */
export function catalogEntryLink(entry: CatalogEntry): CatalogLink {
	if (entry.guideId) {
		return { kind: 'app', to: guideRoute(entry.guideId) };
	}
	if (entry.appRoute) {
		return { kind: 'app', to: entry.appRoute };
	}
	return { kind: 'docs', href: docsPageUrl(entry.docsSlug) };
}

export function queryTerms(query: string): string[] {
	return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesTerms(text: string, terms: string[]): boolean {
	const haystack = text.toLowerCase();
	return terms.every((term) => haystack.includes(term));
}

function entryText(entry: CatalogEntry): string {
	return [entry.name, entry.how, entry.description, ...entry.keywords].join(' ');
}

/** Sections for the filter, keeping entries that match every search word. */
export function filterCatalog(
	sections: CatalogSection[],
	query: string,
	filter: CatalogFilter,
): CatalogSection[] {
	const terms = queryTerms(query);
	return sections
		.filter((section) => filter === 'all' || filter === section.id)
		.map((section) => ({
			...section,
			entries: section.entries.filter((entry) =>
				matchesTerms(entryText(entry), terms),
			),
		}))
		.filter((section) => section.entries.length > 0);
}

function lastSeen(timestamp: number | null, now: number): string {
	return timestamp ? ` · last ${dayjs(timestamp).from(now)}` : '';
}

/** One line per signal for the status strip, from /onboarding/status. */
export function signalSummaries(
	status: OnboardingtypesStatusDTO | undefined,
	now: number,
): SignalSummary[] {
	const traces = status?.traces;
	const metrics = status?.metrics;
	const logs = status?.logs;
	return [
		{
			key: 'traces',
			name: 'Traces',
			received: Boolean(traces?.received),
			detail: traces?.received
				? `${formatCount(traces.count)} spans · ${formatCount(traces.operations)} operations${lastSeen(traces.lastSeen, now)}`
				: 'Instrument an app below',
		},
		{
			key: 'metrics',
			name: 'Metrics',
			received: Boolean(metrics?.received),
			detail: metrics?.received
				? `${formatCount(metrics.series)} series${lastSeen(metrics.lastSeen, now)}`
				: 'Run the collector or add a host',
		},
		{
			key: 'logs',
			name: 'Logs',
			received: Boolean(logs?.received),
			detail: logs?.received
				? `${formatCount(logs.count)} records${lastSeen(logs.lastSeen, now)}`
				: 'Ship files or container logs',
		},
	];
}

const RECEIVING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when a built-in integration sent logs or metrics in the last day. */
export function isRecentlyReceiving(
	status: IntegrationConnectionStatus | undefined,
	now: number,
): boolean {
	const last = Math.max(
		status?.logs?.last_received_ts_ms ?? 0,
		status?.metrics?.last_received_ts_ms ?? 0,
	);
	return last > 0 && now - last < RECEIVING_WINDOW_MS;
}

const FALLBACK_ENDPOINTS: OtlpEndpoints = {
	http: 'http://localhost:4318',
	grpc: 'localhost:4317',
	grpcInsecure: true,
};

/** Snippet endpoints from /onboarding/ingestion; local defaults until it loads. */
export function toOtlpEndpoints(
	ingestion: OnboardingtypesIngestionDTO | undefined,
): OtlpEndpoints {
	if (!ingestion) {
		return FALLBACK_ENDPOINTS;
	}
	return {
		http: ingestion.otlpHttpEndpoint,
		grpc: ingestion.otlpGrpcEndpoint,
		grpcInsecure: ingestion.otlpGrpcInsecure,
	};
}

/** ":4318" from "http://host:4318", the scheme's default port when it has none. */
export function endpointPort(endpoint: string): string {
	const withScheme = /^[a-z]+:\/\//.test(endpoint)
		? endpoint
		: `http://${endpoint}`;
	try {
		const url = new URL(withScheme);
		if (url.port) {
			return `:${url.port}`;
		}
		return url.protocol === 'https:' ? ':443' : ':80';
	} catch {
		return '';
	}
}
