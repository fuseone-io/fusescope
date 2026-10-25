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
	platform: RumtypesPlatformDTO.web,
	environment: 'production',
	allowedOrigins: [],
	allowedPackageNames: [],
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
	const android = values.platform === RumtypesPlatformDTO.android;
	return {
		name: values.name.trim(),
		environment: values.environment.trim(),
		allowedOrigins: android ? [] : values.allowedOrigins,
		allowedPackageNames: android ? values.allowedPackageNames : [],
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
		platform: values.platform,
	};
}

export function formFromApplication(
	application: RumtypesApplicationDTO,
): ApplicationFormValues {
	const policy = application.piiPolicy;
	return {
		name: application.name,
		platform: application.platform,
		environment: application.environment,
		allowedOrigins: application.allowedOrigins ?? [],
		allowedPackageNames: application.allowedPackageNames ?? [],
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

const PACKAGE_NAME = /^[A-Za-z]\w*(\.[A-Za-z]\w*)+$/;

/** The server's rule: `*`, or a package name with an optional trailing `.*`. */
export function invalidPackageName(packageName: string): string | undefined {
	if (
		packageName === '*' ||
		PACKAGE_NAME.test(packageName.replace(/\.\*$/, ''))
	) {
		return undefined;
	}
	return 'Use the applicationId, e.g. com.example.shop or com.example.*';
}

export function invalidUrlPrefix(prefix: string): string | undefined {
	const url = parse(prefix);
	return url && isHttp(url) && url.host
		? undefined
		: 'Use an absolute http or https URL';
}
