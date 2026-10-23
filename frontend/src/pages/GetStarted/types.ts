import type { GuideId } from './guides/types';

export type CatalogSignal = 'Traces' | 'Metrics' | 'Logs' | 'RUM';

export type CatalogSectionId =
	| 'apps'
	| 'collector'
	| 'infra'
	| 'logs'
	| 'db'
	| 'frontend'
	| 'ai';

export type CatalogFilter = 'all' | CatalogSectionId | 'otel';

export interface CatalogEntry {
	/** Unique across the catalog. */
	id: string;
	category: CatalogSectionId;
	name: string;
	/** How the data is collected: "Zero-code agent", "filelog receiver". */
	how: string;
	description: string;
	/** Logo asset URL; `initials` is drawn when it is missing. */
	icon?: string;
	initials: string;
	signals: CatalogSignal[];
	keywords: string[];
	/** Opens the in-app guide at /get-started/<guideId>. */
	guideId?: GuideId;
	/** Opens an in-app page instead of the docs (RUM setup, an integration). */
	appRoute?: string;
	/** Built-in integration whose connection status marks the card as receiving. */
	integrationId?: string;
	/** Page on the FuseScope docs site, without leading or trailing slash. */
	docsSlug: string;
}

export interface CatalogSection {
	id: CatalogSectionId;
	title: string;
	subtitle: string;
	more?: { label: string; route: string };
	entries: CatalogEntry[];
}

export type CatalogLink =
	| { kind: 'app'; to: string }
	| { kind: 'docs'; href: string };

export type SignalKey = 'traces' | 'metrics' | 'logs';

export interface SignalSummary {
	key: SignalKey;
	name: 'Traces' | 'Metrics' | 'Logs';
	received: boolean;
	detail: string;
}
