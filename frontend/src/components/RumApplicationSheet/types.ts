import type { RumtypesPIIPolicyDTO } from 'api/generated/services/fuseScope.schemas';

export interface ApplicationFormValues {
	name: string;
	environment: string;
	allowedOrigins: string[];
	tracePropagationUrls: string[];
	/** 0–100; the API takes a fraction. */
	samplePercent: number;
	dropQuery: boolean;
	queryAllowlist: string[];
	urlAllowlist: string[];
	geoLookup: boolean;
	requireConsent: boolean;
	hashUserId: boolean;
}

/** `new` until the application exists; then its id, and its key while it is known. */
export type SheetTarget =
	| { mode: 'new' }
	| { mode: 'edit'; applicationId: string };

export type SheetTab = 'settings' | 'key' | 'install';

export interface SnippetInput {
	applicationId: string;
	name: string;
	environment: string;
	publicKey: string;
	endpoint: string;
	sampleRate: number;
	tracePropagationUrls: string[];
	piiPolicy: RumtypesPIIPolicyDTO;
}
