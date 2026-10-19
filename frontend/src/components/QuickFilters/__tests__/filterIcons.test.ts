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
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';

import { getFilterIcon } from '../filterIcons';

describe('getFilterIcon', () => {
	it.each([
		['service.name', Server],
		['serviceName', Server],
		['name', Tag],
		['duration_nano', Timer],
		['durationNano', Timer],
		['has_error', TriangleAlert],
		['hasError', TriangleAlert],
		['trace_id', Link],
		['span_id', Link],
		['deployment.environment', Cloud],
		['kind', Shapes],
		['kind_string', Shapes],
		['response_status_code', Hash],
		['http.response.status_code', Hash],
		['http_method', Globe],
		['http.request.method', Globe],
		['rpc.method', ArrowRightLeft],
		['severity_text', Gauge],
		['body', Text],
	])('maps the key %s', (key, icon) => {
		expect(getFilterIcon(key)).toBe(icon);
	});

	it.each([
		['http.route', Globe],
		['rpc.service', Network],
		['db.system', Database],
		['k8s.pod.name', Box],
		['k8s.cluster.name', Box],
		['container.name', Container],
		['host.name', Server],
		['messaging.system', MessagesSquare],
		['cloud.region', Cloud],
		['exception.type', Bug],
		['process.pid', Cpu],
		['telemetry.sdk.language', Radio],
		['otel.scope.name', Radio],
		['user.id', User],
		['enduser.id', User],
		['url.full', Link],
		['HTTP.ROUTE', Globe],
	])('maps the namespace of %s', (key, icon) => {
		expect(getFilterIcon(key)).toBe(icon);
	});

	it.each([
		[DataTypes.String, Tag],
		[DataTypes.Int64, Binary],
		[DataTypes.Float64, Binary],
		[DataTypes.bool, ToggleLeft],
		['number', Binary],
		['bool', ToggleLeft],
		['string', Tag],
		[undefined, Tag],
		['something-else', Tag],
	])('falls back on the data type %s', (dataType, icon) => {
		expect(getFilterIcon('my.custom.attribute', dataType)).toBe(icon);
	});

	it('prefers the key over the data type', () => {
		expect(getFilterIcon('duration_nano', DataTypes.Float64)).toBe(Timer);
	});
});
