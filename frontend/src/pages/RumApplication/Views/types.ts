import { SortState } from 'components/PageTemplate/types';
import { VitalSummary } from 'lib/rum/metricTypes';

export interface ViewRow {
	route: string;
	views: number;
	pageLoads: number;
	routeChanges: number;
	/** Views from SDKs before 0.2.0, which report no loading type. */
	unknownLoads: number;
	lcp?: VitalSummary;
	inp?: VitalSummary;
	cls?: VitalSummary;
	timeOnViewMs: number;
	errors: number;
	slowest?: { label: string; host: string; p75Ms: number };
}

export type ViewSortKey =
	| 'route'
	| 'views'
	| 'pageLoads'
	| 'routeChanges'
	| 'lcp'
	| 'inp'
	| 'cls'
	| 'timeOnView'
	| 'errors'
	| 'slowest';

export type ViewSort = SortState<ViewSortKey>;

export interface ClientShare {
	name: string;
	/** Whole percent. */
	share: number;
	lcpP75Ms?: number;
}

export interface ClientShares {
	/** Page loads, or views when the range has none (SDKs before 0.2.0). */
	basis: 'pageLoads' | 'views';
	rows: ClientShare[];
}

export interface VitalPoint {
	/** Epoch ms of the bucket start. */
	at: number;
	p75: number;
}

export interface ReleaseMarker {
	release: string;
	at: number;
}
