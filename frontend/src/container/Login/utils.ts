import APIError from 'types/api/error';
import { ErrorV2 } from 'types/api';
import { OrgSessionContext } from 'types/api/v2/sessions/context/get';

import { OrgAuthN } from './types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PROVIDER_LABELS: Record<string, string> = {
	saml: 'SAML',
	oidc: 'OIDC',
	google: 'Google',
};

export const isValidEmail = (email: string): boolean =>
	EMAIL_PATTERN.test(email.trim());

function parseErrors(errors: string): { message: string }[] {
	try {
		const parsedErrors = JSON.parse(errors);
		return parsedErrors.map((error: { message: string }) => ({
			message: error.message,
		}));
	} catch (e) {
		console.error('Failed to parse errors:', e);
		return [];
	}
}

/** The error the callback authN redirect puts in the query string. */
export function callbackErrorFromParams(
	params: URLSearchParams,
): APIError | undefined {
	if (!params.get('callbackauthnerr')) {
		return undefined;
	}

	return new APIError({
		httpStatusCode: 500,
		error: {
			code: params.get('code') || '',
			message: params.get('message') || '',
			url: params.get('url') || '',
			errors: parseErrors(params.get('errors') || ''),
		},
	});
}

export const warningToError = (warning: ErrorV2): APIError =>
	new APIError({
		httpStatusCode: 400,
		error: {
			code: warning.code,
			message: warning.message,
			url: warning.url,
			errors: warning.errors,
		},
	});

/** `forcePassword` is the `?password=Y` override for a misconfigured callback authN. */
export function getOrgAuthN(
	org: OrgSessionContext | undefined,
	forcePassword: boolean,
): OrgAuthN {
	if (!org) {
		return { password: false };
	}

	const callback = org.authNSupport?.callback?.[0];
	const password = (org.authNSupport?.password?.length ?? 0) > 0;

	return {
		password: password || forcePassword,
		callbackUrl: forcePassword ? undefined : callback?.url,
	};
}

export function describeOrgAuthN(org: OrgSessionContext): string {
	const callback = org.authNSupport?.callback?.[0];
	const password = (org.authNSupport?.password?.length ?? 0) > 0;
	const sso = callback
		? `Single sign-on · ${PROVIDER_LABELS[callback.provider] ?? callback.provider}`
		: undefined;

	if (sso && password) {
		return `${sso} or email and password`;
	}
	return sso ?? (password ? 'Email and password' : 'No sign-in method');
}

export function urlHost(url: string): string | undefined {
	try {
		return new URL(url).host || undefined;
	} catch {
		return undefined;
	}
}
