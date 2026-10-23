import dotnetUrl from '@/assets/Logos/dotnet.svg';

import {
	dockerRun,
	exporterVars,
	imageName,
	k8sEnv,
	shellExports,
} from './snippets';
import type { Guide, Snippet, SnippetInput } from './types';

const RELEASES =
	'https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation/releases/download';

const INSTALL = `version="v1.17.0"
curl -sSfL -o otel-dotnet-auto-install.sh \\
  "${RELEASES}/$version/otel-dotnet-auto-install.sh"
VERSION="$version" sh ./otel-dotnet-auto-install.sh
chmod +x $HOME/.otel-dotnet-auto/instrument.sh
. $HOME/.otel-dotnet-auto/instrument.sh`;

const DOCKERFILE = `FROM mcr.microsoft.com/dotnet/aspnet:8.0
ARG OTEL_VERSION=v1.17.0
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \\
 && rm -rf /var/lib/apt/lists/*
ENV OTEL_DOTNET_AUTO_HOME=/otel-dotnet-auto
RUN curl -sSfL -o /tmp/install.sh \\
      "${RELEASES}/\${OTEL_VERSION}/otel-dotnet-auto-install.sh" \\
 && SKIP_RELEASE_VERIFICATION=true VERSION="\${OTEL_VERSION}" sh /tmp/install.sh \\
 && rm /tmp/install.sh
WORKDIR /app
COPY publish/ .
ENTRYPOINT ["/bin/sh", "-c", ". $OTEL_DOTNET_AUTO_HOME/instrument.sh && exec dotnet Checkout.dll"]`;

function run(input: SnippetInput): Snippet[] {
	const vars = exporterVars(input, 'http/protobuf', { withProtocol: true });
	switch (input.runtime) {
		case 'docker':
			return [
				{ id: 'dockerfile', label: 'Dockerfile', code: DOCKERFILE },
				{ id: 'docker-run', label: 'Run', code: dockerRun(vars, imageName(input)) },
			];
		case 'k8s':
			return [{ id: 'k8s', label: 'deployment.yaml', code: k8sEnv(input, vars) }];
		default:
			return [{ id: 'shell', code: `${shellExports(vars)}\n./Checkout` }];
	}
}

const dotnet: Guide = {
	id: 'dotnet',
	name: '.NET',
	title: 'Instrument a .NET app',
	summary:
		'OpenTelemetry .NET automatic instrumentation. No code changes; traces, metrics and logs by default.',
	initials: '.N',
	icon: dotnetUrl,
	docsSlug: 'sending-data/instrumentation/dotnet',
	protocol: 'http/protobuf',
	signals: ['Traces', 'Metrics', 'Logs'],
	install: {
		code: INSTALL,
		hint:
			'Linux and macOS. The installer verifies the release with the GitHub CLI (gh). On Windows, use the PowerShell module in the docs.',
		docsAnchor: 'install-and-run',
	},
	run,
	runHints: {
		shell:
			'Run your app from the shell where you loaded instrument.sh. Replace ./Checkout with your app.',
		docker: 'Replace Checkout.dll with your app’s entry assembly.',
	},
	further: [
		{
			label: 'Windows, IIS and Windows services',
			to: 'sending-data/instrumentation/dotnet#install-and-run',
		},
		{
			label: 'Logs with ILogger',
			to: 'sending-data/instrumentation/dotnet#logs',
		},
		{
			label: 'Send to FuseScope over gRPC',
			to: 'sending-data/instrumentation/dotnet#send-to-fusescope',
		},
	],
};

export default dotnet;
