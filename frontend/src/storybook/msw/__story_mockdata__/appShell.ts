/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import type { GetLicense200 } from 'api/generated/services/fuseScope.schemas';
import { USER_PREFERENCES } from 'constants/userPreferences';
import type { UserPreference } from 'types/api/preferences/preference';

/**
 * Wire-shaped payloads for the endpoints the app shell calls on every route.
 * Shapes follow the fields the components read, not the full generated DTOs.
 */

export const baseUserPreferences: UserPreference[] = [
	{
		name: USER_PREFERENCES.SIDENAV_PINNED,
		description: 'Keep the side navigation pinned open',
		valueType: 'boolean',
		defaultValue: false,
		allowedValues: ['true', 'false'],
		allowedScopes: ['user'],
		value: true,
	},
];

export const userPreferencesResponse = (
	preferences: UserPreference[] = baseUserPreferences,
): Record<string, unknown> => ({
	status: 'success',
	data: preferences,
});

export const zeusHostsResponse = {
	status: 'success',
	data: {
		hosts: [{ url: 'https://ingest.us.signoz.cloud:443', is_default: true }],
	},
};

export const versionResponse = {
	version: 'v0.0.0',
	ee: 'N',
	setupCompleted: true,
};

export const latestGithubReleaseResponse = {
	tag_name: 'v0.0.0',
	name: 'v0.0.0',
	html_url: 'https://github.com/SigNoz/signoz/releases/tag/v0.0.0',
};

/**
 * The license `useActiveLicenseKey` reads the key off, keyed by the id the
 * app-shell context carries. Only the key reaches the UI; the rest of the DTO
 * mirrors the context fixture so the two agree on which license this is.
 */
export const licenseWithKeyResponse = {
	status: 'success',
	data: {
		id: 'test-license-id',
		key: '96a1c6a4-3f1e-4b7d-9f2a-8c0d5e6f7a8b',
		state: 'ACTIVATED',
		status: 'VALID',
		platform: 'CLOUD',
		eventQueue: {
			createdAt: '0',
			event: '',
			scheduledAt: '0',
			status: '',
			updatedAt: '0',
		},
		plan: {
			id: '0',
			createdAt: '0',
			description: '',
			isActive: true,
			name: '',
			updatedAt: '0',
		},
		features: [],
		createdAt: '0',
		updatedAt: '0',
		freeUntil: '0',
		validFrom: 0,
		validUntil: 0,
	},
} satisfies GetLicense200;

export const globalConfigResponse = {
	status: 'success',
	data: {
		ai_assistant_url: null,
		external_url: 'https://storybook.signoz.local',
		ingestion_url: 'https://ingest.us.signoz.cloud:443',
		mcp_url: null,
	},
};

/**
 * The Noz entry point in the top nav is off until the backend ships a URL for
 * it, so this variant answers with one.
 */
export const nozGlobalConfigResponse = {
	...globalConfigResponse,
	data: {
		...globalConfigResponse.data,
		ai_assistant_url: 'https://ai.storybook.signoz.local',
	},
};
