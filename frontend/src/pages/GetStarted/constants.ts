import clickhouseUrl from '@/assets/Logos/clickhouse.svg';
import dockerUrl from '@/assets/Logos/docker.svg';
import dotnetUrl from '@/assets/Logos/dotnet.svg';
import elasticacheUrl from '@/assets/Logos/elasticache.svg';
import fluentbitUrl from '@/assets/Logos/fluentbit.svg';
import fromLogFileUrl from '@/assets/Logos/from-log-file.svg';
import goUrl from '@/assets/Logos/go.svg';
import hostmetricsUrl from '@/assets/Logos/hostmetrics.svg';
import javaUrl from '@/assets/Logos/java.svg';
import javascriptUrl from '@/assets/Logos/javascript.svg';
import kubernetesUrl from '@/assets/Logos/kubernetes.svg';
import litellmUrl from '@/assets/Logos/litellm.svg';
import mongoUrl from '@/assets/Logos/mongo.svg';
import nginxUrl from '@/assets/Logos/nginx.svg';
import nodejsUrl from '@/assets/Logos/nodejs.svg';
import phpUrl from '@/assets/Logos/php.svg';
import postgresqlUrl from '@/assets/Logos/postgresql.svg';
import prometheusUrl from '@/assets/Logos/prometheus.svg';
import pythonUrl from '@/assets/Logos/python.svg';
import rdsUrl from '@/assets/Logos/rds.svg';
import redisUrl from '@/assets/Logos/redis.svg';
import rubyUrl from '@/assets/Logos/ruby-on-rails.svg';
import syslogsUrl from '@/assets/Logos/syslogs.svg';
import vmUrl from '@/assets/Logos/vm.svg';
import ROUTES from 'constants/routes';

import type { CatalogEntry, CatalogFilter, CatalogSection } from './types';

const integration = (id: string): string =>
	ROUTES.INTEGRATIONS_DETAIL.replace(':integrationId', id);

const APPS: CatalogEntry[] = [
	{
		id: 'java',
		category: 'apps',
		name: 'Java',
		how: 'Zero-code agent',
		description: 'Java agent JAR. Spring Boot, Quarkus, Micronaut and more.',
		icon: javaUrl,
		initials: 'JV',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: ['jvm', 'spring', 'kotlin', 'scala', 'quarkus', 'agent'],
		guideId: 'java',
		docsSlug: 'sending-data/instrumentation/java',
	},
	{
		id: 'dotnet',
		category: 'apps',
		name: '.NET',
		how: 'Zero-code',
		description: 'ASP.NET Core, worker services and .NET Framework.',
		icon: dotnetUrl,
		initials: '.N',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: ['dotnet', 'csharp', 'c#', 'aspnet'],
		guideId: 'dotnet',
		docsSlug: 'sending-data/instrumentation/dotnet',
	},
	{
		id: 'nodejs',
		category: 'apps',
		name: 'Node.js',
		how: 'Zero-code',
		description: 'Express, Fastify, NestJS, Koa and the http module.',
		icon: nodejsUrl,
		initials: 'JS',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: [
			'node',
			'nodejs',
			'javascript',
			'typescript',
			'express',
			'nestjs',
			'next',
		],
		guideId: 'nodejs',
		docsSlug: 'sending-data/instrumentation/nodejs',
	},
	{
		id: 'python',
		category: 'apps',
		name: 'Python',
		how: 'Zero-code',
		description: 'Django, Flask, FastAPI and Celery.',
		icon: pythonUrl,
		initials: 'PY',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: ['django', 'flask', 'fastapi', 'celery', 'gunicorn', 'uvicorn'],
		guideId: 'python',
		docsSlug: 'sending-data/instrumentation/python',
	},
	{
		id: 'go',
		category: 'apps',
		name: 'Go',
		how: 'SDK',
		description: 'net/http, gRPC, Gin and database/sql.',
		icon: goUrl,
		initials: 'GO',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: ['golang', 'gin', 'grpc', 'slog'],
		guideId: 'go',
		docsSlug: 'sending-data/instrumentation/go',
	},
	{
		id: 'ruby',
		category: 'apps',
		name: 'Ruby',
		how: 'SDK',
		description: 'Rails, Sinatra and Sidekiq.',
		icon: rubyUrl,
		initials: 'RB',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: ['rails', 'sinatra', 'sidekiq'],
		docsSlug: 'sending-data/instrumentation/ruby',
	},
	{
		id: 'php',
		category: 'apps',
		name: 'PHP',
		how: 'Zero-code extension',
		description: 'Laravel, Symfony and Slim.',
		icon: phpUrl,
		initials: 'PH',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: ['laravel', 'symfony', 'slim'],
		docsSlug: 'sending-data/instrumentation/php',
	},
	{
		id: 'browser',
		category: 'apps',
		name: 'Browser',
		how: 'FuseScope browser SDK',
		description: 'Sessions, page views, errors and Web Vitals.',
		icon: javascriptUrl,
		initials: 'WB',
		signals: ['RUM', 'Traces'],
		keywords: ['web', 'rum', 'frontend', 'react', 'vue', 'angular', 'spa'],
		appRoute: ROUTES.RUM_APPLICATIONS,
		docsSlug: 'frontend/set-up-web',
	},
];

const COLLECTOR: CatalogEntry[] = [
	{
		id: 'collector-docker',
		category: 'collector',
		name: 'Docker',
		how: 'Docker Compose',
		description: 'A collector container next to your apps.',
		icon: dockerUrl,
		initials: 'DK',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: ['compose', 'container', 'collector'],
		docsSlug: 'sending-data/collector-docker',
	},
	{
		id: 'collector-kubernetes',
		category: 'collector',
		name: 'Kubernetes',
		how: 'Helm · k8s-infra chart',
		description: 'A DaemonSet agent and a cluster collector in one chart.',
		icon: kubernetesUrl,
		initials: 'K8',
		signals: ['Metrics', 'Logs'],
		keywords: ['k8s', 'helm', 'eks', 'gke', 'aks', 'openshift', 'collector'],
		docsSlug: 'sending-data/kubernetes',
	},
	{
		id: 'collector-vm',
		category: 'collector',
		name: 'VM or bare metal',
		how: 'systemd service',
		description: 'The collector binary as a Linux service.',
		icon: vmUrl,
		initials: 'VM',
		signals: ['Traces', 'Metrics', 'Logs'],
		keywords: [
			'linux',
			'systemd',
			'deb',
			'rpm',
			'ec2',
			'bare metal',
			'collector',
		],
		docsSlug: 'sending-data/collector-vm',
	},
];

const INFRA: CatalogEntry[] = [
	{
		id: 'hosts',
		category: 'infra',
		name: 'Hosts',
		how: 'hostmetrics receiver',
		description: 'CPU, memory, disk, network and processes.',
		icon: hostmetricsUrl,
		initials: 'HM',
		signals: ['Metrics'],
		keywords: ['host', 'vm', 'linux', 'cpu', 'memory', 'disk', 'hostmetrics'],
		docsSlug: 'sending-data/hosts',
	},
	{
		id: 'kubernetes-cluster',
		category: 'infra',
		name: 'Kubernetes cluster',
		how: 'k8s-infra chart',
		description: 'Nodes, pods, containers, events and volumes.',
		icon: kubernetesUrl,
		initials: 'K8',
		signals: ['Metrics', 'Logs'],
		keywords: ['k8s', 'pods', 'nodes', 'kubelet', 'events'],
		docsSlug: 'sending-data/kubernetes',
	},
	{
		id: 'prometheus',
		category: 'infra',
		name: 'Prometheus targets',
		how: 'prometheus receiver',
		description: 'Scrape existing /metrics endpoints.',
		icon: prometheusUrl,
		initials: 'PR',
		signals: ['Metrics'],
		keywords: ['scrape', 'exporter', 'metrics', 'openmetrics'],
		docsSlug: 'sending-data/prometheus',
	},
];

const LOGS: CatalogEntry[] = [
	{
		id: 'log-files',
		category: 'logs',
		name: 'Log files',
		how: 'filelog receiver',
		description: 'Tail files on hosts and parse JSON or regex.',
		icon: fromLogFileUrl,
		initials: 'FL',
		signals: ['Logs'],
		keywords: ['file', 'filelog', 'tail', 'json'],
		docsSlug: 'sending-data/logs-files',
	},
	{
		id: 'kubernetes-logs',
		category: 'logs',
		name: 'Kubernetes logs',
		how: 'k8s-infra chart',
		description: 'Container stdout and stderr with pod metadata.',
		icon: kubernetesUrl,
		initials: 'K8',
		signals: ['Logs'],
		keywords: ['k8s', 'container', 'stdout', 'pods'],
		docsSlug: 'sending-data/logs-kubernetes',
	},
	{
		id: 'syslog',
		category: 'logs',
		name: 'Syslog',
		how: 'syslog receiver',
		description: 'RFC 3164 and 5424 over TCP or UDP.',
		icon: syslogsUrl,
		initials: 'SY',
		signals: ['Logs'],
		keywords: ['rsyslog', 'syslog-ng', 'network'],
		docsSlug: 'sending-data/logs-syslog',
	},
	{
		id: 'fluent',
		category: 'logs',
		name: 'Fluent Bit / Fluentd',
		how: 'fluentforward receiver',
		description: 'Forward from an existing Fluent pipeline.',
		icon: fluentbitUrl,
		initials: 'FB',
		signals: ['Logs'],
		keywords: ['fluent', 'fluentbit', 'fluentd', 'forward'],
		docsSlug: 'sending-data/logs-fluent',
	},
];

interface DatabaseEntry {
	id: string;
	name: string;
	description: string;
	icon: string;
	initials: string;
	integrationId: string;
	keywords: string[];
}

const database = ({
	integrationId,
	...entry
}: DatabaseEntry): CatalogEntry => ({
	...entry,
	category: 'db',
	how: 'Integration',
	signals: ['Metrics', 'Logs'],
	integrationId,
	appRoute: integration(integrationId),
	docsSlug: `sending-data/integrations/${entry.id}`,
});

const DATABASES: CatalogEntry[] = [
	{
		id: 'clickhouse',
		name: 'ClickHouse',
		description: 'Queries, merges, parts and replication.',
		icon: clickhouseUrl,
		initials: 'CH',
		integrationId: 'builtin-clickhouse',
		keywords: ['database'],
	},
	{
		id: 'mongodb',
		name: 'MongoDB',
		description: 'Operations, connections and replication.',
		icon: mongoUrl,
		initials: 'MG',
		integrationId: 'builtin-mongo',
		keywords: ['mongo', 'database'],
	},
	{
		id: 'nginx',
		name: 'Nginx',
		description: 'Requests, status codes and upstream latency.',
		icon: nginxUrl,
		initials: 'NX',
		integrationId: 'builtin-nginx',
		keywords: ['web server', 'proxy'],
	},
	{
		id: 'postgresql',
		name: 'PostgreSQL',
		description: 'Connections, locks, rows and slow queries.',
		icon: postgresqlUrl,
		initials: 'PG',
		integrationId: 'builtin-postgres',
		keywords: ['postgres', 'database'],
	},
	{
		id: 'redis',
		name: 'Redis',
		description: 'Commands, hit ratio, memory and keyspace.',
		icon: redisUrl,
		initials: 'RD',
		integrationId: 'builtin-redis',
		keywords: ['cache'],
	},
	{
		id: 'aws-rds-mysql',
		name: 'AWS RDS (MySQL)',
		description: 'Connections, latency, IOPS and replica lag.',
		icon: rdsUrl,
		initials: 'MY',
		integrationId: 'builtin-aws_rds_mysql',
		keywords: ['aws', 'rds', 'mysql', 'amazon'],
	},
	{
		id: 'aws-rds-postgresql',
		name: 'AWS RDS (PostgreSQL)',
		description: 'Connections, transactions, IOPS and storage.',
		icon: rdsUrl,
		initials: 'RP',
		integrationId: 'builtin-aws_rds_postgresql',
		keywords: ['aws', 'rds', 'postgres', 'amazon'],
	},
	{
		id: 'aws-elasticache-redis',
		name: 'AWS ElastiCache (Redis)',
		description: 'Hit ratio, evictions, memory and CPU.',
		icon: elasticacheUrl,
		initials: 'EC',
		integrationId: 'builtin-aws_elasticache_redis',
		keywords: ['aws', 'elasticache', 'redis', 'amazon'],
	},
].map(database);

const FRONTEND: CatalogEntry[] = [
	{
		id: 'rum-web',
		category: 'frontend',
		name: 'Web application',
		how: 'FuseScope browser SDK',
		description: 'Sessions, views, errors and Web Vitals.',
		icon: javascriptUrl,
		initials: 'WB',
		signals: ['RUM', 'Traces'],
		keywords: ['browser', 'web', 'rum', 'frontend', 'spa'],
		appRoute: ROUTES.RUM_APPLICATIONS,
		docsSlug: 'frontend/set-up-web',
	},
	{
		id: 'rum-source-maps',
		category: 'frontend',
		name: 'Source maps',
		how: 'FuseScope CLI',
		description: 'Readable stack traces for minified bundles.',
		initials: 'SM',
		signals: ['RUM'],
		keywords: ['sourcemap', 'cli', 'upload', 'webpack', 'vite'],
		appRoute: ROUTES.RUM_APPLICATIONS,
		docsSlug: 'frontend/source-maps',
	},
];

const AI: CatalogEntry[] = [
	{
		id: 'ai-python',
		category: 'ai',
		name: 'Python LLM apps',
		how: 'GenAI instrumentation',
		description: 'OpenAI, Anthropic, Bedrock and LangChain.',
		icon: pythonUrl,
		initials: 'PY',
		signals: ['Traces', 'Metrics'],
		keywords: [
			'ai',
			'llm',
			'genai',
			'openai',
			'anthropic',
			'bedrock',
			'langchain',
		],
		docsSlug: 'analyze/ai-observability-python',
	},
	{
		id: 'ai-nodejs',
		category: 'ai',
		name: 'Node.js LLM apps',
		how: 'GenAI instrumentation',
		description: 'OpenAI, Anthropic and LangChain.',
		icon: nodejsUrl,
		initials: 'JS',
		signals: ['Traces', 'Metrics'],
		keywords: [
			'ai',
			'llm',
			'genai',
			'openai',
			'anthropic',
			'javascript',
			'langchain',
		],
		docsSlug: 'analyze/ai-observability-nodejs',
	},
	{
		id: 'ai-gateway',
		category: 'ai',
		name: 'LLM gateway',
		how: 'OTLP from the gateway',
		description: 'Gateways and proxies that already emit GenAI spans.',
		icon: litellmUrl,
		initials: 'GW',
		signals: ['Traces', 'Metrics'],
		keywords: ['ai', 'llm', 'gateway', 'proxy', 'litellm'],
		docsSlug: 'analyze/ai-observability',
	},
];

export const CATALOG_SECTIONS: CatalogSection[] = [
	{
		id: 'apps',
		title: 'Instrument an app',
		subtitle: 'OpenTelemetry SDKs send traces, metrics and logs over OTLP.',
		entries: APPS,
	},
	{
		id: 'collector',
		title: 'Run the collector',
		subtitle: 'Collect, batch and forward from your hosts and clusters.',
		entries: COLLECTOR,
	},
	{
		id: 'infra',
		title: 'Infrastructure',
		subtitle: 'Host and cluster health, joined to your services.',
		entries: INFRA,
	},
	{
		id: 'logs',
		title: 'Logs',
		subtitle: 'Ship existing logs without changing your apps.',
		entries: LOGS,
	},
	{
		id: 'db',
		title: 'Databases and services',
		subtitle: 'Built-in integrations with dashboards included.',
		more: { label: 'All integrations', route: ROUTES.INTEGRATIONS },
		entries: DATABASES,
	},
	{
		id: 'frontend',
		title: 'Frontend',
		subtitle: 'Real user monitoring linked to backend traces.',
		more: { label: 'Open Frontend', route: ROUTES.RUM_APPLICATIONS },
		entries: FRONTEND,
	},
	{
		id: 'ai',
		title: 'AI / LLM',
		subtitle: 'OpenTelemetry GenAI semantic conventions: prompts, tokens, cost.',
		more: {
			label: 'Open AI Observability',
			route: ROUTES.AI_OBSERVABILITY_OVERVIEW,
		},
		entries: AI,
	},
];

export const CATALOG_FILTERS: { value: CatalogFilter; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'apps', label: 'Apps' },
	{ value: 'collector', label: 'Collector' },
	{ value: 'infra', label: 'Infrastructure' },
	{ value: 'logs', label: 'Logs' },
	{ value: 'db', label: 'Databases & services' },
	{ value: 'frontend', label: 'Frontend' },
	{ value: 'ai', label: 'AI/LLM' },
	{ value: 'otel', label: 'OpenTelemetry' },
];

/** What the "Already using OpenTelemetry?" block answers to in search. */
export const OTEL_KEYWORDS =
	'opentelemetry otel otlp endpoint exporter collector environment variables';

export const DEFAULT_SERVICE_NAME = 'my-service';
export const DEFAULT_ENVIRONMENT = 'production';
export const STATUS_POLL_INTERVAL_MS = 5000;
