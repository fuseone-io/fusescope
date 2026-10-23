import type { EnvVar, GuideRuntime, OtlpProtocol, SnippetInput } from './types';

const PORTS: Record<OtlpProtocol, number> = {
	'http/protobuf': 4318,
	grpc: 4317,
};

/** Where a collector next to the app listens, per runtime (see the collector docs). */
const LOCAL_COLLECTOR_HOST: Record<GuideRuntime, string> = {
	shell: 'localhost',
	docker: 'otel-collector',
	k8s: 'fusescope-otel-collector.fusescope.svc.cluster.local',
};

function grpcUrl(endpoint: string, insecure: boolean): string {
	if (/^https?:\/\//.test(endpoint)) {
		return endpoint;
	}
	return `${insecure ? 'http' : 'https'}://${endpoint}`;
}

/** The OTEL_EXPORTER_OTLP_ENDPOINT value for the chosen route and runtime. */
export function exporterEndpoint(
	protocol: OtlpProtocol,
	{ route, runtime, endpoints }: SnippetInput,
): string {
	if (route === 'local') {
		return `http://${LOCAL_COLLECTOR_HOST[runtime]}:${PORTS[protocol]}`;
	}
	return protocol === 'grpc'
		? grpcUrl(endpoints.grpc, endpoints.grpcInsecure)
		: endpoints.http;
}

const SHELL_SAFE = /^[\w.,:/=@%+-]+$/;

export function shellValue(value: string): string {
	if (SHELL_SAFE.test(value)) {
		return value;
	}
	const escaped = value.replace(/["\\$`]/g, (char) => `\\${char}`);
	return `"${escaped}"`;
}

const YAML_INDICATOR_START = /^([?:,[\]{}#&*!|>'"%@`]|- |-$)/;

export function yamlValue(value: string): string {
	const needsQuotes =
		value === '' ||
		value.trim() !== value ||
		YAML_INDICATOR_START.test(value) ||
		value.includes(': ') ||
		value.includes(' #');
	return needsQuotes ? JSON.stringify(value) : value;
}

function environmentAttribute(environment: string): string | undefined {
	const env = environment.trim();
	return env ? `deployment.environment.name=${env}` : undefined;
}

export function serviceName(input: SnippetInput): string {
	return input.service.trim() || 'my-service';
}

/** OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES (when set) and the endpoint. */
export function exporterVars(
	input: SnippetInput,
	protocol: OtlpProtocol,
	{ withProtocol }: { withProtocol: boolean },
): EnvVar[] {
	const attributes = environmentAttribute(input.environment);
	return [
		{ name: 'OTEL_SERVICE_NAME', value: serviceName(input) },
		...(attributes
			? [{ name: 'OTEL_RESOURCE_ATTRIBUTES', value: attributes }]
			: []),
		{
			name: 'OTEL_EXPORTER_OTLP_ENDPOINT',
			value: exporterEndpoint(protocol, input),
		},
		...(withProtocol
			? [{ name: 'OTEL_EXPORTER_OTLP_PROTOCOL', value: protocol }]
			: []),
	];
}

export const SIGNAL_EXPORTERS: EnvVar[] = [
	{ name: 'OTEL_TRACES_EXPORTER', value: 'otlp' },
	{ name: 'OTEL_METRICS_EXPORTER', value: 'otlp' },
	{ name: 'OTEL_LOGS_EXPORTER', value: 'otlp' },
];

export const LOGS_EXPORTER: EnvVar = {
	name: 'OTEL_LOGS_EXPORTER',
	value: 'otlp',
};

function valueOf(variable: EnvVar): string {
	return 'value' in variable ? variable.value : '';
}

export function shellExports(vars: EnvVar[]): string {
	return vars
		.map((variable) => `export ${variable.name}=${shellValue(valueOf(variable))}`)
		.join('\n');
}

export function dockerRun(vars: EnvVar[], image: string): string {
	const flags = vars.map(
		(variable) => `  -e ${variable.name}=${shellValue(valueOf(variable))} \\`,
	);
	return ['docker run \\', ...flags, `  ${image}`].join('\n');
}

/**
 * The pod spec `env:` list. The downward API adds the pod name and namespace,
 * and OTEL_RESOURCE_ATTRIBUTES comes last because `$(VAR)` only expands
 * variables defined earlier in the list.
 */
export function k8sEnv(input: SnippetInput, vars: EnvVar[]): string {
	const attributes = [
		environmentAttribute(input.environment),
		'k8s.pod.name=$(K8S_POD_NAME)',
		'k8s.namespace.name=$(K8S_NAMESPACE_NAME)',
	]
		.filter(Boolean)
		.join(',');
	const all: EnvVar[] = [
		...vars.filter((variable) => variable.name !== 'OTEL_RESOURCE_ATTRIBUTES'),
		{ name: 'K8S_POD_NAME', fieldPath: 'metadata.name' },
		{ name: 'K8S_NAMESPACE_NAME', fieldPath: 'metadata.namespace' },
		{ name: 'OTEL_RESOURCE_ATTRIBUTES', value: attributes },
	];
	const lines = all.map((variable) =>
		'value' in variable
			? `  - name: ${variable.name}\n    value: ${yamlValue(variable.value)}`
			: `  - name: ${variable.name}\n    valueFrom:\n      fieldRef:\n        fieldPath: ${variable.fieldPath}`,
	);
	return ['env:', ...lines].join('\n');
}

export function imageName(input: SnippetInput): string {
	const name = serviceName(input)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^[-._]+|[-._]+$/g, '');
	return `${name || 'my-service'}:latest`;
}

/** SDK exporter variables for apps already instrumented with OpenTelemetry. */
export function otelEnvSnippet(httpEndpoint: string): string {
	return [
		`OTEL_EXPORTER_OTLP_ENDPOINT=${httpEndpoint}`,
		'OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf',
		'OTEL_SERVICE_NAME=my-service',
	].join('\n');
}

/** Forwarding from a collector the user already runs (docs: OTLP › From another collector). */
export function collectorExporterSnippet(httpEndpoint: string): string {
	const pipeline = (name: string): string =>
		`    ${name}:\n      receivers: [otlp]\n      exporters: [otlphttp]`;
	return [
		'exporters:',
		'  otlphttp:',
		`    endpoint: ${yamlValue(httpEndpoint)}`,
		'',
		'service:',
		'  pipelines:',
		pipeline('traces'),
		pipeline('metrics'),
		pipeline('logs'),
	].join('\n');
}
