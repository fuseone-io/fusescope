export type OIDCPresetId = 'generic' | 'entra' | 'keycloak' | 'okta' | 'auth0';

export interface OIDCPreset {
	id: OIDCPresetId;
	label: string;
	issuerPlaceholder: string;
	scopes: string[];
}

// Presets only prefill the form: every provider here is plain OpenID Connect.
export const OIDC_PRESETS: OIDCPreset[] = [
	{
		id: 'generic',
		label: 'Generic OIDC',
		issuerPlaceholder: 'https://idp.example.com',
		scopes: [],
	},
	{
		id: 'entra',
		label: 'Microsoft Entra ID',
		issuerPlaceholder: 'https://login.microsoftonline.com/<tenant-id>/v2.0',
		scopes: [],
	},
	{
		id: 'keycloak',
		label: 'Keycloak',
		issuerPlaceholder: 'https://<host>/realms/<realm>',
		scopes: [],
	},
	{
		id: 'okta',
		label: 'Okta',
		issuerPlaceholder: 'https://<your-org>.okta.com',
		// Okta only adds the groups claim when the groups scope is requested.
		scopes: ['groups'],
	},
	{
		id: 'auth0',
		label: 'Auth0',
		issuerPlaceholder: 'https://<tenant>.<region>.auth0.com/',
		scopes: [],
	},
];

export const DEFAULT_OIDC_PRESET = OIDC_PRESETS[0];
