import pythonUrl from '@/assets/Logos/python.svg';

import {
	dockerRun,
	exporterVars,
	imageName,
	k8sEnv,
	LOGS_EXPORTER,
	shellExports,
	SIGNAL_EXPORTERS,
} from './snippets';
import type { Guide, Snippet, SnippetInput } from './types';

const DOCKERFILE = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \\
    opentelemetry-distro opentelemetry-exporter-otlp \\
 && opentelemetry-bootstrap -a install
COPY . .
CMD ["opentelemetry-instrument", "gunicorn", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "main:app"]`;

function run(input: SnippetInput): Snippet[] {
	const vars = exporterVars(input, 'http/protobuf', { withProtocol: true });
	switch (input.runtime) {
		case 'docker':
			return [
				{ id: 'dockerfile', label: 'Dockerfile', code: DOCKERFILE },
				{
					id: 'docker-run',
					label: 'Run',
					code: dockerRun([...vars, LOGS_EXPORTER], imageName(input)),
				},
			];
		case 'k8s':
			return [
				{
					id: 'k8s',
					label: 'deployment.yaml',
					code: k8sEnv(input, [...vars, LOGS_EXPORTER]),
				},
			];
		default:
			return [
				{
					id: 'shell',
					code: `${shellExports([...vars, ...SIGNAL_EXPORTERS])}\nopentelemetry-instrument python app.py`,
				},
			];
	}
}

const python: Guide = {
	id: 'python',
	name: 'Python',
	title: 'Instrument a Python app',
	summary:
		'OpenTelemetry zero-code instrumentation with opentelemetry-instrument. No code changes.',
	initials: 'PY',
	icon: pythonUrl,
	docsSlug: 'sending-data/instrumentation/python',
	protocol: 'http/protobuf',
	signals: ['Traces', 'Metrics', 'Logs'],
	install: {
		code:
			'pip install opentelemetry-distro opentelemetry-exporter-otlp\nopentelemetry-bootstrap -a install',
		hint:
			'Run it in your app’s virtual environment: opentelemetry-bootstrap adds instrumentation for the libraries it finds installed. Needs Python 3.10 or later.',
	},
	run,
	runHints: {
		shell:
			'Django, Flask, Uvicorn and Gunicorn each need a slightly different command; see Web servers and workers in the docs.',
	},
	further: [
		{
			label: 'Web servers and workers',
			to: 'sending-data/instrumentation/python#web-servers-and-workers',
		},
		{
			label: 'AI observability for Python',
			to: 'analyze/ai-observability-python',
		},
		{
			label: 'Logs with trace context',
			to: 'sending-data/instrumentation/python#logs',
		},
	],
};

export default python;
