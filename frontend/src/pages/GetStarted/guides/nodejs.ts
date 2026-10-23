import nodejsUrl from '@/assets/Logos/nodejs.svg';

import {
	dockerRun,
	exporterVars,
	imageName,
	k8sEnv,
	LOGS_EXPORTER,
	shellExports,
	SIGNAL_EXPORTERS,
} from './snippets';
import type { EnvVar, Guide, Snippet, SnippetInput } from './types';

const REGISTER = '--require @opentelemetry/auto-instrumentations-node/register';
const NODE_OPTIONS: EnvVar = { name: 'NODE_OPTIONS', value: REGISTER };

const DOCKERFILE = `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_OPTIONS="${REGISTER}"
CMD ["node", "app.js"]`;

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
					code: k8sEnv(input, [NODE_OPTIONS, ...vars]),
				},
			];
		default:
			return [
				{
					id: 'shell',
					code: `${shellExports([...vars, ...SIGNAL_EXPORTERS, NODE_OPTIONS])}\nnode app.js`,
				},
			];
	}
}

const nodejs: Guide = {
	id: 'nodejs',
	name: 'Node.js',
	title: 'Instrument a Node.js app',
	summary:
		'OpenTelemetry zero-code instrumentation. No code changes, about 5 minutes.',
	initials: 'JS',
	icon: nodejsUrl,
	docsSlug: 'sending-data/instrumentation/nodejs',
	protocol: 'http/protobuf',
	signals: ['Traces', 'Metrics', 'Logs'],
	install: {
		code:
			'npm install --save @opentelemetry/api @opentelemetry/auto-instrumentations-node',
		hint:
			'Instruments Express, Fastify, Koa, NestJS, http, fetch, database drivers, Redis, Kafka and more. Needs Node.js 22.15 or later.',
	},
	run,
	runHints: {
		shell:
			'ES modules: --require hooks only CommonJS modules, so some libraries may not be patched.',
	},
	further: [
		{
			label: 'Logs with pino, winston and bunyan',
			to: 'sending-data/instrumentation/nodejs#logs',
		},
		{
			label: 'AI observability for Node.js',
			to: 'analyze/ai-observability-nodejs',
		},
		{
			label: 'Link browser sessions to these traces',
			to: '/frontend/applications',
		},
	],
};

export default nodejs;
