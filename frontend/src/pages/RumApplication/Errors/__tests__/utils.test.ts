import type { RumtypesErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';

import { ErrorFilters } from '../types';
import {
	errorListParams,
	filterGroups,
	parseErrorFilters,
	releasesSummary,
	sessionShare,
	sourceMapMissing,
	writeErrorFilters,
} from '../utils';

const group = (
	patch: Partial<RumtypesErrorGroupDTO> = {},
): RumtypesErrorGroupDTO => ({
	fingerprint: '3fa8b015c0d1e2f3',
	type: 'TypeError',
	message: "Cannot read properties of undefined (reading 'price')",
	normalizedMessage: "Cannot read properties of undefined (reading 'price')",
	topFrame: {
		function: 'Ue',
		file: 'https://shop.example.com/assets/main.js',
		line: 1,
		column: 48213,
		original: null,
	},
	source: 'onerror',
	route: '/product/:id',
	events: 388,
	sessions: 214,
	firstSeenAt: '2026-10-22T09:14:00Z',
	firstSeenRelease: '1.8.0',
	lastSeenAt: '2026-10-23T14:02:00Z',
	lastSeenRelease: '1.8.0',
	releases: ['1.8.0'],
	newInRelease: true,
	sparkline: { start: '2026-10-22T14:00:00Z', stepSeconds: 3600, counts: [] },
	...patch,
});

describe('parseErrorFilters', () => {
	it.each([
		['', { search: '', source: '', route: '' }],
		[
			'?q=price&source=unhandledrejection&route=%2Fcart&release=1.8.0',
			{ search: 'price', source: 'unhandledrejection', route: '/cart' },
		],
		['?source=bogus', { search: '', source: '', route: '' }],
	])('%s', (search, filters) => {
		expect(parseErrorFilters(search)).toStrictEqual(filters);
	});
});

describe('writeErrorFilters', () => {
	it('keeps other params and drops empty filters', () => {
		expect(
			writeErrorFilters('?release=1.8.0&q=old', { search: '', source: 'onerror' }),
		).toBe('?release=1.8.0&source=onerror');
		expect(writeErrorFilters('?q=a', { search: '' })).toBe('');
	});
});

describe('filterGroups', () => {
	const groups = [
		group(),
		group({
			fingerprint: 'b',
			type: 'HttpError',
			message: 'POST /api/cart returned 502',
			source: 'unhandledrejection',
			route: '/cart',
		}),
	];

	it.each([
		[{ search: '', source: '', route: '' }, ['3fa8b015c0d1e2f3', 'b']],
		[{ search: 'api/CART', source: '', route: '' }, ['b']],
		[{ search: 'typeerror', source: '', route: '' }, ['3fa8b015c0d1e2f3']],
		[{ search: 'main.js', source: '', route: '' }, ['3fa8b015c0d1e2f3', 'b']],
		[{ search: '', source: 'onerror', route: '' }, ['3fa8b015c0d1e2f3']],
		[{ search: '', source: '', route: '/cart' }, ['b']],
	] satisfies [ErrorFilters, string[]][])('%o', (filters, fingerprints) => {
		expect(
			filterGroups(groups, filters).map((item) => item.fingerprint),
		).toStrictEqual(fingerprints);
	});
});

describe('sessionShare', () => {
	it.each([
		[214, 48_600, '0.44%'],
		[61, 48_600, '0.13%'],
		[30, 200, '15.0%'],
		[5, 0, undefined],
	])('%d of %d', (sessions, total, text) => {
		expect(sessionShare(sessions, total)).toBe(text);
	});
});

describe('releasesSummary', () => {
	it.each([
		[[], { first: '', more: 0 }],
		[['1.8.0'], { first: '1.8.0', more: 0 }],
		[['1.7.4', '1.8.0', '1.7.3'], { first: '1.8.0', more: 2 }],
	])('%o', (releases, summary) => {
		expect(
			releasesSummary(group({ releases, lastSeenRelease: '1.8.0' })),
		).toStrictEqual(summary);
	});
});

describe('sourceMapMissing', () => {
	const uploaded = new Set(['1.7.4']);

	it.each([
		['the last release has no maps', group(), true],
		['the last release has maps', group({ lastSeenRelease: '1.7.4' }), false],
		['no release is known', group({ lastSeenRelease: '' }), false],
		['the frame has no bundle file', group({ topFrame: null }), false],
		[
			'the frame is the browser’s own',
			group({
				topFrame: {
					function: 'Array.map',
					file: '<anonymous>',
					line: 0,
					column: 0,
					original: null,
				},
			}),
			false,
		],
		[
			'the frame is an inline script on the page',
			group({
				topFrame: {
					function: 'onclick',
					file: 'https://shop.example.com/checkout?step=2',
					line: 12,
					column: 3,
					original: null,
				},
			}),
			false,
		],
	])('%s', (_name, input, missing) => {
		expect(sourceMapMissing(input, uploaded)).toBe(missing);
	});

	it('says nothing until the uploads are known', () => {
		expect(sourceMapMissing(group(), undefined)).toBe(false);
	});
});

describe('errorListParams', () => {
	it('asks for the top groups of the window and release', () => {
		expect(errorListParams({ start: 1, end: 2 }, '1.8.0')).toStrictEqual({
			start: 1,
			end: 2,
			release: '1.8.0',
			limit: 200,
		});
		expect(errorListParams({ start: 1, end: 2 }, '')).toStrictEqual({
			start: 1,
			end: 2,
			limit: 200,
		});
	});
});
