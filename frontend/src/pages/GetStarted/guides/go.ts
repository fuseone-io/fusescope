import goUrl from '@/assets/Logos/go.svg';

import {
	dockerRun,
	exporterVars,
	imageName,
	k8sEnv,
	shellExports,
} from './snippets';
import type { Guide, Snippet, SnippetInput } from './types';

const INSTALL = `go get go.opentelemetry.io/otel \\
  go.opentelemetry.io/otel/sdk \\
  go.opentelemetry.io/otel/sdk/metric \\
  go.opentelemetry.io/otel/sdk/log \\
  go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc \\
  go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc \\
  go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc \\
  go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp \\
  go.opentelemetry.io/contrib/instrumentation/runtime \\
  go.opentelemetry.io/contrib/bridges/otelslog`;

const DOCKERFILE = `FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /checkout .

FROM gcr.io/distroless/static-debian12
COPY --from=build /checkout /checkout
ENTRYPOINT ["/checkout"]`;

function run(input: SnippetInput): Snippet[] {
	const vars = exporterVars(input, 'grpc', { withProtocol: false });
	switch (input.runtime) {
		case 'docker':
			return [
				{ id: 'dockerfile', label: 'Dockerfile', code: DOCKERFILE },
				{ id: 'docker-run', label: 'Run', code: dockerRun(vars, imageName(input)) },
			];
		case 'k8s':
			return [{ id: 'k8s', label: 'deployment.yaml', code: k8sEnv(input, vars) }];
		default:
			return [{ id: 'shell', code: `${shellExports(vars)}\ngo run .` }];
	}
}

const go: Guide = {
	id: 'go',
	name: 'Go',
	title: 'Instrument a Go app',
	summary: 'The OpenTelemetry Go SDK over OTLP gRPC, set up once in main.go.',
	initials: 'GO',
	icon: goUrl,
	docsSlug: 'sending-data/instrumentation/go',
	protocol: 'grpc',
	signals: ['Traces', 'Metrics', 'Logs'],
	install: {
		code: INSTALL,
		hint:
			'Then add the setupOTel function from the docs to main.go: it sets up traces, metrics and logs and reads the variables below.',
		docsAnchor: 'set-up-the-sdk',
	},
	run,
	runHints: {
		shell:
			'The …grpc exporters always use gRPC on port 4317. For OTLP/HTTP, switch the imports to otlptracehttp, otlpmetrichttp and otlploghttp.',
	},
	further: [
		{
			label: 'Set up the SDK in main.go',
			to: 'sending-data/instrumentation/go#set-up-the-sdk',
		},
		{ label: 'Logs with log/slog', to: 'sending-data/instrumentation/go#logs' },
		{
			label: 'Send over OTLP/HTTP',
			to: 'sending-data/instrumentation/go#send-to-fusescope',
		},
	],
};

export default go;
