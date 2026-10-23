import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import {
	RumtypesPlatformDTO,
	RumtypesSourceMapRetentionDTO,
} from 'api/generated/services/fuseScope.schemas';

import {
	DEFAULT_FORM_VALUES,
	formFromApplication,
	invalidOrigin,
	invalidUrlPrefix,
	toPostableApplication,
	toUpdatableApplication,
} from '../utils/form';
import { ApplicationFormValues } from '../types';

const VALUES: ApplicationFormValues = {
	...DEFAULT_FORM_VALUES,
	name: '  web-shop ',
	environment: ' production',
	allowedOrigins: ['https://shop.example.com'],
	tracePropagationUrls: ['https://api.shop.example.com'],
	samplePercent: 25,
	queryAllowlist: ['utm_source'],
	requireConsent: true,
};

const APPLICATION: RumtypesApplicationDTO = {
	id: 'app-1',
	orgId: 'org-1',
	name: 'checkout',
	platform: RumtypesPlatformDTO.web,
	environment: 'staging',
	allowedOrigins: null,
	tracePropagationUrls: ['https://api.example.com'],
	sampleRate: 0.5,
	createdBy: 'admin@fusescope.local',
	firstSeenAt: null,
	sourceMaps: {
		retention: RumtypesSourceMapRetentionDTO['90d'],
		keepNewestReleases: true,
	},
	piiPolicy: {
		dropQuery: false,
		queryAllowlist: null,
		urlAllowlist: ['https://shop.example.com/search'],
		geoLookup: false,
		requireConsent: false,
		hashUserId: true,
	},
};

describe('application form payloads', () => {
	it('starts a new web application with privacy on and every session kept', () => {
		expect(DEFAULT_FORM_VALUES).toMatchObject({
			environment: 'production',
			samplePercent: 100,
			dropQuery: true,
			geoLookup: false,
			requireConsent: false,
			hashUserId: true,
		});
	});

	it('creates a trimmed web application with the sample rate as a fraction', () => {
		expect(toPostableApplication(VALUES)).toStrictEqual({
			name: 'web-shop',
			platform: RumtypesPlatformDTO.web,
			environment: 'production',
			allowedOrigins: ['https://shop.example.com'],
			tracePropagationUrls: ['https://api.shop.example.com'],
			sampleRate: 0.25,
			piiPolicy: {
				dropQuery: true,
				queryAllowlist: ['utm_source'],
				urlAllowlist: [],
				geoLookup: false,
				requireConsent: true,
				hashUserId: true,
			},
		});
	});

	it('updates without the platform, which cannot change', () => {
		const updatable = toUpdatableApplication(VALUES);
		expect(updatable).not.toHaveProperty('platform');
		expect(updatable.sampleRate).toBe(0.25);
	});

	it('reads an application back into the form, nulls as empty lists', () => {
		expect(formFromApplication(APPLICATION)).toStrictEqual({
			name: 'checkout',
			environment: 'staging',
			allowedOrigins: [],
			tracePropagationUrls: ['https://api.example.com'],
			samplePercent: 50,
			dropQuery: false,
			queryAllowlist: [],
			urlAllowlist: ['https://shop.example.com/search'],
			geoLookup: false,
			requireConsent: false,
			hashUserId: true,
		});
	});

	it('round-trips an application', () => {
		const back = toUpdatableApplication(formFromApplication(APPLICATION));
		expect(back.sampleRate).toBe(0.5);
		expect(back.piiPolicy?.urlAllowlist).toStrictEqual([
			'https://shop.example.com/search',
		]);
	});
});

describe('invalidOrigin', () => {
	it.each([
		['https://shop.example.com', false],
		['http://localhost:3360', false],
		['https://*.example.com', false],
		['*', false],
		['https://shop.example.com/', false],
		['shop.example.com', true],
		['https://shop.example.com/path', true],
		['ftp://shop.example.com', true],
		['https://a.*.example.com', true],
	])('%s → %s', (origin, invalid) => {
		expect(Boolean(invalidOrigin(origin))).toBe(invalid);
	});
});

describe('invalidUrlPrefix', () => {
	it.each([
		['https://api.example.com', false],
		['http://localhost:8080/api', false],
		['/api', true],
		['api.example.com', true],
	])('%s → %s', (prefix, invalid) => {
		expect(Boolean(invalidUrlPrefix(prefix))).toBe(invalid);
	});
});
