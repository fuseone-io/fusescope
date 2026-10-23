import { guideById } from '../registry';
import {
	collectorExporterSnippet,
	exporterEndpoint,
	otelEnvSnippet,
	shellValue,
	yamlValue,
} from '../snippets';
import type { GuideId, GuideRuntime, SnippetInput } from '../types';

const ENDPOINTS = {
	http: 'http://otel.example.com:4318',
	grpc: 'otel.example.com:4317',
	grpcInsecure: true,
};

function input(overrides: Partial<SnippetInput> = {}): SnippetInput {
	return {
		service: 'checkout',
		environment: 'production',
		route: 'direct',
		runtime: 'shell',
		endpoints: ENDPOINTS,
		...overrides,
	};
}

function code(id: GuideId, overrides: Partial<SnippetInput> = {}): string {
	const guide = guideById(id);
	if (!guide) {
		throw new Error(`no guide ${id}`);
	}
	return guide
		.run(input(overrides))
		.map((snippet) => snippet.code)
		.join('\n');
}

describe('exporterEndpoint', () => {
	it.each<
		[
			string,
			SnippetInput['route'],
			GuideRuntime,
			'http/protobuf' | 'grpc',
			string,
		]
	>([
		[
			'direct HTTP',
			'direct',
			'shell',
			'http/protobuf',
			'http://otel.example.com:4318',
		],
		['direct gRPC', 'direct', 'k8s', 'grpc', 'http://otel.example.com:4317'],
		[
			'local HTTP in a shell',
			'local',
			'shell',
			'http/protobuf',
			'http://localhost:4318',
		],
		['local gRPC in a shell', 'local', 'shell', 'grpc', 'http://localhost:4317'],
		[
			'local HTTP in Docker',
			'local',
			'docker',
			'http/protobuf',
			'http://otel-collector:4318',
		],
		[
			'local HTTP in Kubernetes',
			'local',
			'k8s',
			'http/protobuf',
			'http://fusescope-otel-collector.fusescope.svc.cluster.local:4318',
		],
	])('%s', (_, route, runtime, protocol, expected) => {
		expect(exporterEndpoint(protocol, input({ route, runtime }))).toBe(expected);
	});

	it('uses https for a gRPC endpoint with TLS', () => {
		expect(
			exporterEndpoint(
				'grpc',
				input({ endpoints: { ...ENDPOINTS, grpcInsecure: false } }),
			),
		).toBe('https://otel.example.com:4317');
	});
});

describe('quoting', () => {
	it.each([
		['checkout', 'checkout'],
		[
			'deployment.environment.name=prod,k8s.pod.name=$(K8S_POD_NAME)',
			'"deployment.environment.name=prod,k8s.pod.name=\\$(K8S_POD_NAME)"',
		],
		['my service', '"my service"'],
		['', '""'],
	])('shell value %p', (value, expected) => {
		expect(shellValue(value)).toBe(expected);
	});

	it.each([
		['checkout', 'checkout'],
		['--require x', '--require x'],
		['a: b', '"a: b"'],
		['', '""'],
	])('yaml value %p', (value, expected) => {
		expect(yamlValue(value)).toBe(expected);
	});
});

describe('install commands match the docs', () => {
	it.each<[GuideId, string]>([
		[
			'nodejs',
			'npm install --save @opentelemetry/api @opentelemetry/auto-instrumentations-node',
		],
		[
			'python',
			'pip install opentelemetry-distro opentelemetry-exporter-otlp\nopentelemetry-bootstrap -a install',
		],
		[
			'java',
			'curl -L -o opentelemetry-javaagent.jar \\\n  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar',
		],
		['dotnet', '. $HOME/.otel-dotnet-auto/instrument.sh'],
		['go', 'go.opentelemetry.io/contrib/bridges/otelslog'],
	])('%s', (id, expected) => {
		expect(guideById(id)?.install.code).toContain(expected);
	});
});

describe('run snippets', () => {
	it.each<[GuideId, GuideRuntime, string[]]>([
		[
			'nodejs',
			'shell',
			[
				'export OTEL_SERVICE_NAME=checkout',
				'export OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=production',
				'export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel.example.com:4318',
				'export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf',
				'export OTEL_TRACES_EXPORTER=otlp',
				'export OTEL_METRICS_EXPORTER=otlp',
				'export OTEL_LOGS_EXPORTER=otlp',
				'export NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"',
				'node app.js',
			],
		],
		[
			'nodejs',
			'docker',
			[
				'ENV NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"',
				'CMD ["node", "app.js"]',
				'  -e OTEL_SERVICE_NAME=checkout \\',
				'  -e OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \\',
				'  -e OTEL_LOGS_EXPORTER=otlp \\',
				'  checkout:latest',
			],
		],
		[
			'nodejs',
			'k8s',
			[
				'  - name: NODE_OPTIONS\n    value: --require @opentelemetry/auto-instrumentations-node/register',
				'  - name: OTEL_EXPORTER_OTLP_ENDPOINT\n    value: http://otel.example.com:4318',
				'    value: deployment.environment.name=production,k8s.pod.name=$(K8S_POD_NAME),k8s.namespace.name=$(K8S_NAMESPACE_NAME)',
			],
		],
		[
			'python',
			'shell',
			[
				'export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf',
				'export OTEL_LOGS_EXPORTER=otlp',
				'opentelemetry-instrument python app.py',
			],
		],
		[
			'python',
			'docker',
			[
				'&& opentelemetry-bootstrap -a install',
				'CMD ["opentelemetry-instrument", "gunicorn"',
				'  -e OTEL_LOGS_EXPORTER=otlp \\',
			],
		],
		['python', 'k8s', ['  - name: OTEL_LOGS_EXPORTER\n    value: otlp']],
		[
			'java',
			'shell',
			[
				'export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf',
				'java -javaagent:./opentelemetry-javaagent.jar -jar app.jar',
			],
		],
		[
			'java',
			'docker',
			[
				'ENV JAVA_TOOL_OPTIONS="-javaagent:/otel/opentelemetry-javaagent.jar"',
				'CMD ["java", "-jar", "app.jar"]',
			],
		],
		[
			'java',
			'k8s',
			[
				'  - name: JAVA_TOOL_OPTIONS\n    value: -javaagent:/otel/opentelemetry-javaagent.jar',
			],
		],
		[
			'dotnet',
			'shell',
			['export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf', './Checkout'],
		],
		[
			'dotnet',
			'docker',
			[
				'ENTRYPOINT ["/bin/sh", "-c", ". $OTEL_DOTNET_AUTO_HOME/instrument.sh && exec dotnet Checkout.dll"]',
			],
		],
		[
			'go',
			'shell',
			[
				'export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel.example.com:4317',
				'go run .',
			],
		],
		[
			'go',
			'docker',
			[
				'ENTRYPOINT ["/checkout"]',
				'  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://otel.example.com:4317 \\',
			],
		],
		[
			'go',
			'k8s',
			[
				'  - name: OTEL_EXPORTER_OTLP_ENDPOINT\n    value: http://otel.example.com:4317',
			],
		],
	])('%s on %s', (id, runtime, lines) => {
		const snippet = code(id, { runtime });
		lines.forEach((line) => expect(snippet).toContain(line));
	});

	it('does not set a protocol for Go, whose exporters are gRPC only', () => {
		expect(code('go')).not.toContain('OTEL_EXPORTER_OTLP_PROTOCOL');
	});

	it('follows the service name and environment as typed', () => {
		const snippet = code('nodejs', {
			service: 'cart api',
			environment: 'staging',
		});
		expect(snippet).toContain('export OTEL_SERVICE_NAME="cart api"');
		expect(snippet).toContain(
			'export OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=staging',
		);
	});

	it('leaves out the resource attributes without an environment', () => {
		expect(code('nodejs', { environment: ' ' })).not.toContain(
			'OTEL_RESOURCE_ATTRIBUTES',
		);
	});

	it('sends to a local collector when asked', () => {
		expect(code('python', { route: 'local' })).toContain(
			'export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318',
		);
	});

	it('never adds an ingestion key header', () => {
		(['nodejs', 'python', 'java', 'dotnet', 'go'] as GuideId[]).forEach((id) =>
			(['shell', 'docker', 'k8s'] as GuideRuntime[]).forEach((runtime) =>
				expect(code(id, { runtime })).not.toMatch(/HEADERS|ingestion-key/i),
			),
		);
	});
});

describe('OpenTelemetry exporter snippets', () => {
	it('sets the SDK environment from the HTTP endpoint', () => {
		expect(otelEnvSnippet('https://otlp.example.com')).toBe(
			[
				'OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com',
				'OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf',
				'OTEL_SERVICE_NAME=my-service',
			].join('\n'),
		);
	});

	it('forwards every pipeline from another collector with otlphttp', () => {
		const yaml = collectorExporterSnippet('https://otlp.example.com');
		expect(yaml).toContain(
			'exporters:\n  otlphttp:\n    endpoint: https://otlp.example.com',
		);
		['traces', 'metrics', 'logs'].forEach((pipeline) =>
			expect(yaml).toContain(
				`    ${pipeline}:\n      receivers: [otlp]\n      exporters: [otlphttp]`,
			),
		);
	});
});
