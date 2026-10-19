import {
	ArrowRightLeft,
	Binary,
	Box,
	Bug,
	Cloud,
	Container,
	Cpu,
	Database,
	Gauge,
	Globe,
	Hash,
	Link,
	LucideIcon,
	MessagesSquare,
	Network,
	Radio,
	Server,
	Shapes,
	Tag,
	Text,
	Timer,
	ToggleLeft,
	TriangleAlert,
	User,
} from 'lucide-react';

const KEY_ICONS: Record<string, LucideIcon> = {
	'service.name': Server,
	servicename: Server,
	name: Tag,
	duration_nano: Timer,
	durationnano: Timer,
	has_error: TriangleAlert,
	haserror: TriangleAlert,
	trace_id: Link,
	traceid: Link,
	span_id: Link,
	spanid: Link,
	'deployment.environment': Cloud,
	kind: Shapes,
	kind_string: Shapes,
	span_kind: Shapes,
	response_status_code: Hash,
	responsestatuscode: Hash,
	'http.status_code': Hash,
	'http.response.status_code': Hash,
	http_method: Globe,
	httpmethod: Globe,
	'http.method': Globe,
	'http.request.method': Globe,
	'rpc.method': ArrowRightLeft,
	severity_text: Gauge,
	severity_number: Gauge,
	body: Text,
};

// First match wins, so longer namespaces go before the ones they extend.
const NAMESPACE_ICONS: [string, LucideIcon][] = [
	['http.', Globe],
	['http_', Globe],
	['url.', Link],
	['rpc.', Network],
	['db.', Database],
	['k8s.', Box],
	['container.', Container],
	['host.', Server],
	['messaging.', MessagesSquare],
	['cloud.', Cloud],
	['exception.', Bug],
	['process.', Cpu],
	['telemetry.', Radio],
	['otel.', Radio],
	['enduser.', User],
	['user.', User],
];

const NUMBER_TYPES = new Set(['int64', 'float64', 'number']);

/** The icon of a quick-filter section: its key, then its namespace, then its type. */
export function getFilterIcon(key: string, dataType?: string): LucideIcon {
	const normalized = key.toLowerCase();
	const byKey = KEY_ICONS[normalized];
	if (byKey) {
		return byKey;
	}
	const byNamespace = NAMESPACE_ICONS.find(([prefix]) =>
		normalized.startsWith(prefix),
	);
	if (byNamespace) {
		return byNamespace[1];
	}
	if (dataType && NUMBER_TYPES.has(dataType)) {
		return Binary;
	}
	if (dataType === 'bool') {
		return ToggleLeft;
	}
	return Tag;
}
