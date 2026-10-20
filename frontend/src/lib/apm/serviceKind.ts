import {
	Database,
	ExternalLink,
	Globe,
	LucideIcon,
	MessagesSquare,
	Network,
	Server,
	Zap,
} from 'lucide-react';

export type ServiceKindName =
	| 'database'
	| 'cache'
	| 'queue'
	| 'rpc'
	| 'web'
	| 'external'
	| 'service';

/** What is known about a service; every signal is optional and counts are spans. */
export interface ServiceKindInfo {
	name: string;
	dbSystem?: string;
	dbSpans?: number;
	messagingSpans?: number;
	rpcServerSpans?: number;
	httpServerSpans?: number;
	serverSpans?: number;
	/** Named as `peer.service` on spans that carry database attributes. */
	databasePeer?: boolean;
	/** Seen only as the target of client calls, never reporting itself. */
	externalOnly?: boolean;
}

export interface ServiceKind {
	kind: ServiceKindName;
	icon: LucideIcon;
	label: string;
}

const KINDS: Record<ServiceKindName, ServiceKind> = {
	database: { kind: 'database', icon: Database, label: 'Database' },
	cache: { kind: 'cache', icon: Zap, label: 'Cache' },
	queue: { kind: 'queue', icon: MessagesSquare, label: 'Queue' },
	rpc: { kind: 'rpc', icon: Network, label: 'RPC' },
	web: { kind: 'web', icon: Globe, label: 'Web' },
	external: { kind: 'external', icon: ExternalLink, label: 'External' },
	service: { kind: 'service', icon: Server, label: 'Service' },
};

const CACHE = /redis|memcache|valkey|dragonfly/;
const DATABASE =
	/mysql|postgres|mongo|cassandra|clickhouse|oracle|mssql|sqlite|mariadb|cockroach/;
const QUEUE = /kafka|rabbit|sqs|nats|pulsar/;
const RPC = /grpc/;
const WEB = /frontend|web|api|gateway|(^|[-_.])ui($|[-_.])/;

/**
 * A service's type for its icon, from span signals when there are any and
 * from its name otherwise: cache, database, queue, RPC, web, external, or a
 * plain service.
 */
export function getServiceKind(info: ServiceKindInfo): ServiceKind {
	const name = info.name.toLowerCase();
	const dbSystem = (info.dbSystem ?? '').toLowerCase();
	const rpc = info.rpcServerSpans ?? 0;
	const http = info.httpServerSpans ?? 0;

	if (CACHE.test(name) || CACHE.test(dbSystem)) {
		return KINDS.cache;
	}
	if (
		dbSystem ||
		(info.dbSpans ?? 0) > 0 ||
		info.databasePeer ||
		DATABASE.test(name)
	) {
		return KINDS.database;
	}
	if ((info.messagingSpans ?? 0) > 0 || QUEUE.test(name)) {
		return KINDS.queue;
	}
	if (rpc > 0 && rpc > http) {
		return KINDS.rpc;
	}
	if (http > 0) {
		return KINDS.web;
	}
	if (RPC.test(name)) {
		return KINDS.rpc;
	}
	if (WEB.test(name)) {
		return KINDS.web;
	}
	if (info.externalOnly) {
		return KINDS.external;
	}
	return KINDS.service;
}
