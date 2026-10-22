import type {
	RumtypesApplicationDTO,
	RumtypesPIIPolicyDTO,
	RumtypesPostableApplicationDTO,
	RumtypesUpdatableApplicationDTO,
} from 'api/generated/services/fuseScope.schemas';
import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';

import { ApplicationFormValues } from '../types';

export const DEFAULT_FORM_VALUES: ApplicationFormValues = {
	name: '',
	environment: 'production',
	allowedOrigins: [],
	tracePropagationUrls: [],
	samplePercent: 100,
	dropQuery: true,
	queryAllowlist: [],
	urlAllowlist: [],
	geoLookup: false,
	requireConsent: false,
	hashUserId: true,
};

function piiPolicy(values: ApplicationFormValues): RumtypesPIIPolicyDTO {
	return {
		dropQuery: values.dropQuery,
		queryAllowlist: values.queryAllowlist,
		urlAllowlist: values.urlAllowlist,
		geoLookup: values.geoLookup,
		requireConsent: values.requireConsent,
		hashUserId: values.hashUserId,
	};
}

export function toUpdatableApplication(
	values: ApplicationFormValues,
): RumtypesUpdatableApplicationDTO {
	return {
		name: values.name.trim(),
		environment: values.environment.trim(),
		allowedOrigins: values.allowedOrigins,
		tracePropagationUrls: values.tracePropagationUrls,
		sampleRate: Math.round(values.samplePercent) / 100,
		piiPolicy: piiPolicy(values),
	};
}

export function toPostableApplication(
	values: ApplicationFormValues,
): RumtypesPostableApplicationDTO {
	return {
		...toUpdatableApplication(values),
		platform: RumtypesPlatformDTO.web,
	};
}

export function formFromApplication(
	application: RumtypesApplicationDTO,
): ApplicationFormValues {
	const policy = application.piiPolicy;
	return {
		name: application.name,
		environment: application.environment,
		allowedOrigins: application.allowedOrigins ?? [],
		tracePropagationUrls: application.tracePropagationUrls ?? [],
		samplePercent: Math.round(application.sampleRate * 100),
		dropQuery: policy.dropQuery,
		queryAllowlist: policy.queryAllowlist ?? [],
		urlAllowlist: policy.urlAllowlist ?? [],
		geoLookup: policy.geoLookup,
		requireConsent: policy.requireConsent,
		hashUserId: policy.hashUserId,
	};
}

function parse(value: string): URL | undefined {
	try {
		return new URL(value);
	} catch {
		return undefined;
	}
}

const isHttp = (url: URL): boolean =>
	url.protocol === 'http:' || url.protocol === 'https:';

/** The server's rule: `*`, or scheme://host[:port] with an optional leading `*.`. */
export function invalidOrigin(origin: string): string | undefined {
	if (origin === '*') {
		return undefined;
	}
	const match = /^(https?):\/\/([^/?#]+)\/?$/.exec(origin);
	const host = match?.[2] ?? '';
	if (!match || host.includes('@') || host.replace(/^\*\./, '').includes('*')) {
		return 'Use scheme://host[:port], e.g. https://shop.example.com';
	}
	return undefined;
}

export function invalidUrlPrefix(prefix: string): string | undefined {
	const url = parse(prefix);
	return url && isHttp(url) && url.host
		? undefined
		: 'Use an absolute http or https URL';
}
