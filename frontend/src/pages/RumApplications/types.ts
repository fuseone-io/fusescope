import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import { ApplicationMetrics } from 'lib/rum/metricTypes';
import { SdkSupport } from 'lib/rum/types';

export interface ApplicationRow {
	application: RumtypesApplicationDTO;
	metrics?: ApplicationMetrics;
	support: SdkSupport;
}

export type PlatformFilter = 'all' | 'web' | 'android' | 'ios';

export interface ApplicationFilters {
	search: string;
	platform: PlatformFilter;
	environment: string;
}

export interface ApplicationsKpis {
	applications: number;
	web: number;
	mobile: number;
	sessions: number;
	previousSessions?: number;
	errorRate?: number;
	previousErrorRate?: number;
	/** Percent of LCP samples rated good. */
	goodLcp?: number;
	outdated: ApplicationRow[];
}
