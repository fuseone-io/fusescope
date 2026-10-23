import type { CatalogSignal } from '../types';

export type GuideId = 'nodejs' | 'python' | 'java' | 'dotnet' | 'go';

export type GuideRuntime = 'shell' | 'docker' | 'k8s';

export type GuideRoute = 'direct' | 'local';

export type OtlpProtocol = 'http/protobuf' | 'grpc';

export interface OtlpEndpoints {
	/** OTLP/HTTP base URL. */
	http: string;
	/** host:port, or a URL, for OTLP/gRPC. */
	grpc: string;
	grpcInsecure: boolean;
}

export interface SnippetInput {
	service: string;
	environment: string;
	route: GuideRoute;
	runtime: GuideRuntime;
	endpoints: OtlpEndpoints;
}

export interface Snippet {
	id: string;
	/** Shown above the block when a tab has more than one. */
	label?: string;
	code: string;
}

export interface GuideLink {
	label: string;
	/** A docs slug with an optional `#anchor`, or an in-app route starting with `/`. */
	to: string;
}

export interface Guide {
	id: GuideId;
	name: string;
	title: string;
	summary: string;
	initials: string;
	icon?: string;
	docsSlug: string;
	protocol: OtlpProtocol;
	signals: CatalogSignal[];
	install: { code: string; hint?: string; docsAnchor?: string };
	run: (input: SnippetInput) => Snippet[];
	/** Under the run snippet, per runtime. */
	runHints?: Partial<Record<GuideRuntime, string>>;
	further: GuideLink[];
}

/** An environment variable a snippet sets; `valueFrom` is a downward API field. */
export type EnvVar =
	| { name: string; value: string }
	| { name: string; fieldPath: string };
