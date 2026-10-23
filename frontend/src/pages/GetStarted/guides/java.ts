import javaUrl from '@/assets/Logos/java.svg';

import {
	dockerRun,
	exporterVars,
	imageName,
	k8sEnv,
	shellExports,
} from './snippets';
import type { EnvVar, Guide, Snippet, SnippetInput } from './types';

const AGENT_URL =
	'https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar';

const JAVA_TOOL_OPTIONS: EnvVar = {
	name: 'JAVA_TOOL_OPTIONS',
	value: '-javaagent:/otel/opentelemetry-javaagent.jar',
};

const DOCKERFILE = `FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/app.jar app.jar
ADD ${AGENT_URL} /otel/opentelemetry-javaagent.jar
ENV JAVA_TOOL_OPTIONS="-javaagent:/otel/opentelemetry-javaagent.jar"
CMD ["java", "-jar", "app.jar"]`;

function run(input: SnippetInput): Snippet[] {
	const vars = exporterVars(input, 'http/protobuf', { withProtocol: true });
	switch (input.runtime) {
		case 'docker':
			return [
				{ id: 'dockerfile', label: 'Dockerfile', code: DOCKERFILE },
				{ id: 'docker-run', label: 'Run', code: dockerRun(vars, imageName(input)) },
			];
		case 'k8s':
			return [
				{
					id: 'k8s',
					label: 'deployment.yaml',
					code: k8sEnv(input, [JAVA_TOOL_OPTIONS, ...vars]),
				},
			];
		default:
			return [
				{
					id: 'shell',
					code: `${shellExports(vars)}\njava -javaagent:./opentelemetry-javaagent.jar -jar app.jar`,
				},
			];
	}
}

const java: Guide = {
	id: 'java',
	name: 'Java',
	title: 'Instrument a Java app',
	summary:
		'The OpenTelemetry Java agent. No code changes; traces, metrics and logs by default.',
	initials: 'JV',
	icon: javaUrl,
	docsSlug: 'sending-data/instrumentation/java',
	protocol: 'http/protobuf',
	signals: ['Traces', 'Metrics', 'Logs'],
	install: {
		code: `curl -L -o opentelemetry-javaagent.jar \\\n  ${AGENT_URL}`,
		hint:
			'In production, pin a version from the releases page instead of latest. Needs Java 8 or later.',
	},
	run,
	runHints: {
		shell:
			'Can’t change the command line? Set JAVA_TOOL_OPTIONS=-javaagent:/path/to/opentelemetry-javaagent.jar instead.',
	},
	further: [
		{
			label: 'Logback and Log4j logs',
			to: 'sending-data/instrumentation/java#logs',
		},
		{
			label: 'Send to FuseScope over gRPC',
			to: 'sending-data/instrumentation/java#send-to-fusescope',
		},
		{
			label: 'Link browser sessions to these traces',
			to: '/frontend/applications',
		},
	],
};

export default java;
