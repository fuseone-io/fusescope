/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import type {
	RumtypesAffectedSessionDTO,
	RumtypesErrorEventDTO,
	RumtypesErrorGroupDTO,
	RumtypesGettableErrorGroupDTO,
	RumtypesGettableErrorGroupsDTO,
	RumtypesGettableSourceMapsDTO,
	RumtypesSourceMapFileDTO,
	RumtypesStackFrameDTO,
	RumtypesTimelineEventDTO,
} from 'api/generated/services/fuseScope.schemas';
import {
	RumtypesArtifactKindDTO,
	RumtypesLoadingTypeDTO,
	RumtypesSourceMapRetentionDTO,
	RumtypesTimelineEventKindDTO,
} from 'api/generated/services/fuseScope.schemas';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();
const ORIGIN = 'https://shop.example.com';

export const HTTP_ERROR = 'ec82dea88ad412e0';
export const TYPE_ERROR = '3fa8b015c0d1e2f3';

type GroupRow = [
	fingerprint: string,
	type: string,
	message: string,
	frame: [fn: string, file: string, column: number],
	source: string,
	route: string,
	events: number,
	sessions: number,
	releases: string[],
	firstSeenMs: number,
	lastSeenMs: number,
	newInRelease: boolean,
	trend: 'new' | 'spike' | 'flat',
];

const GROUPS: GroupRow[] = [
	[
		TYPE_ERROR,
		'TypeError',
		"Cannot read properties of undefined (reading 'price')",
		['Ue', '/assets/main.4f9c2a.js', 48213],
		'onerror',
		'/product/:id',
		388,
		214,
		['1.8.0'],
		29 * HOUR,
		2 * MINUTE,
		true,
		'new',
	],
	[
		'a1c90e44d2b7f018',
		'ChunkLoadError',
		'Loading chunk 412 failed. (error: https://shop.example.com/assets/412.js)',
		['Mt', '/assets/main.4f9c2a.js', 1022],
		'onerror',
		'/search',
		121,
		117,
		['1.8.0', '1.7.4'],
		9 * DAY,
		9 * MINUTE,
		false,
		'flat',
	],
	[
		HTTP_ERROR,
		'HttpError',
		'POST /api/cart returned 502',
		['ar', '/assets/cart.9b1e07.js', 3381],
		'unhandledrejection',
		'/cart',
		96,
		61,
		['1.8.0', '1.7.4'],
		4 * DAY,
		14 * MINUTE,
		false,
		'spike',
	],
	[
		'5d02e9b7c4a31f66',
		'SecurityError',
		"Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
		['Lr', '/assets/main.4f9c2a.js', 912],
		'onerror',
		'/',
		44,
		44,
		['1.8.0', '1.7.4', '1.7.3'],
		23 * DAY,
		HOUR,
		false,
		'flat',
	],
	[
		'0b7c18e2f9a4d533',
		'TypeError',
		"undefined is not an object (evaluating 'e.items.length')",
		['Rn', '/assets/main.71be04.js', 20311],
		'onerror',
		'/cart',
		19,
		17,
		['1.7.2'],
		20 * DAY,
		3 * HOUR,
		false,
		'flat',
	],
	[
		'c3a57f10e8d2b694',
		'Error',
		'Checkout aborted by the user',
		['Qc', '/assets/checkout.e51a3b.js', 702],
		'manual',
		'/checkout',
		12,
		12,
		['1.8.0'],
		6 * DAY,
		26 * MINUTE,
		false,
		'flat',
	],
];

function counts(trend: GroupRow[12], seed: number): number[] {
	return Array.from({ length: 24 }, (_, hour) => {
		const noise = (seed * (hour + 3)) % 4;
		if (trend === 'new') {
			return hour < 19 ? 0 : 6 + noise;
		}
		if (trend === 'spike') {
			return hour === 20 || hour === 21 ? 9 : 1 + noise / 2;
		}
		return 2 + noise / 2;
	});
}

const minifiedFrame = (
	fn: string,
	path: string,
	column: number,
): RumtypesStackFrameDTO => ({
	function: fn,
	file: `${ORIGIN}${path}`,
	line: 1,
	column,
	original: null,
});

function errorGroup(row: GroupRow, index: number): RumtypesErrorGroupDTO {
	const [
		fingerprint,
		type,
		message,
		[fn, path, column],
		source,
		route,
		events,
		sessions,
		releases,
		firstSeenMs,
		lastSeenMs,
		newInRelease,
		trend,
	] = row;
	return {
		fingerprint,
		type,
		message,
		normalizedMessage: message,
		topFrame: minifiedFrame(fn, path, column),
		source,
		route,
		events,
		sessions,
		firstSeenAt: ago(firstSeenMs),
		firstSeenRelease: releases[releases.length - 1],
		lastSeenAt: ago(lastSeenMs),
		lastSeenRelease: releases[0],
		releases,
		newInRelease,
		sparkline: {
			start: ago(24 * HOUR),
			stepSeconds: 3600,
			counts: counts(trend, index + 2),
		},
	};
}

export const RUM_ERROR_GROUPS = GROUPS.map(errorGroup);

/** Six groups of web-shop; `empty` has none in the range. */
export function rumErrorGroups(empty = false): RumtypesGettableErrorGroupsDTO {
	const groups = empty ? [] : RUM_ERROR_GROUPS;
	return {
		groups,
		total: groups.length,
		events: groups.reduce((sum, group) => sum + group.events, 0),
		sessions: empty ? 0 : 48_600,
	};
}

const CART_CONTEXT = [
	'export async function updateQuantity(lineId: string, qty: number) {',
	"  const res = await http.post('/api/cart', { lineId, qty });",
	'  if (!res.ok) {',
	"    throw new HttpError('POST /api/cart', res.status);",
	'  }',
	'  return (await res.json()) as Cart;',
	'}',
];

const symbolicated = (
	minified: RumtypesStackFrameDTO,
	fn: string,
	file: string,
	line: number,
	column: number,
	context?: string[],
): RumtypesStackFrameDTO =>
	minified && {
		...minified,
		original: {
			function: fn,
			file,
			line,
			column,
			inApp: !file.startsWith('node_modules/'),
			sourceMap: `${minified.file.replace(ORIGIN, '')}.map`,
			context: context ? { startLine: line - 3, lines: context } : null,
			inlined: false,
		},
	};

function httpFrames(mapped: boolean): RumtypesStackFrameDTO[] {
	const frames: [RumtypesStackFrameDTO, string, string, number, number][] = [
		[
			minifiedFrame('ar', '/assets/cart.9b1e07.js', 3381),
			'updateQuantity',
			'src/features/cart/api.ts',
			57,
			11,
		],
		[
			minifiedFrame('or', '/assets/cart.9b1e07.js', 4120),
			'onIncrement',
			'src/features/cart/CartLine.tsx',
			31,
			5,
		],
		[
			minifiedFrame('Object.mutationFn', '/assets/cart.9b1e07.js', 5012),
			'mutationFn',
			'src/features/cart/useCart.ts',
			22,
			12,
		],
		[
			minifiedFrame('', '/assets/vendor.c2d81f.js', 91544),
			'fn',
			'node_modules/@tanstack/query-core/build/modern/mutation.js',
			96,
			24,
		],
		[
			minifiedFrame('', '/assets/vendor.c2d81f.js', 90210),
			'run',
			'node_modules/@tanstack/query-core/build/modern/retryer.js',
			131,
			9,
		],
		[
			minifiedFrame('', '/assets/vendor.c2d81f.js', 88017),
			'execute',
			'node_modules/@tanstack/query-core/build/modern/mutation.js',
			72,
			3,
		],
	];
	return frames.map(([frame, fn, file, line, column], index) =>
		mapped
			? symbolicated(
					frame,
					fn,
					file,
					line,
					column,
					index === 0 ? CART_CONTEXT : undefined,
				)
			: frame,
	);
}

const stacktrace = (frames: RumtypesStackFrameDTO[]): string =>
	[
		'HttpError: POST /api/cart returned 502',
		...frames.map((frame) =>
			frame?.function
				? `    at ${frame.function} (${frame.file}:${frame.line}:${frame.column})`
				: `    at ${frame?.file}:${frame?.line}:${frame?.column}`,
		),
	].join('\n');

const SESSIONS: [string, number, string, string, string, number, number][] = [
	['7f3ac9d04b1e4a6f9e2b5c8d1a07c21e', 14, '1.8.0', 'Chrome', 'Windows', 9, 1],
	['0d2e71b5c9f84e03a6d1b7c2e5f8a4c9', 19, '1.8.0', 'Safari', 'iOS', 4, 2],
	['6b0f3c8a2d5e4f1b9c7a0e3d6f2b19de', 28, '1.8.0', 'Chrome', 'Android', 6, 1],
	['e3a9d0f7b2c64a18d5e0f9b3c7a15c27', 33, '1.7.4', 'Firefox', 'Windows', 11, 1],
	['48f1b2c6d9e04a7f3b8c5d1e2a6f0e6a', 40, '1.8.0', 'Edge', 'Windows', 5, 1],
];

function affectedSessions(): RumtypesAffectedSessionDTO[] {
	return SESSIONS.map(
		([sessionId, minutes, release, browser, os, views, errors]) => ({
			sessionId,
			startedAt: ago(minutes * MINUTE),
			lastErrorAt: ago(minutes * MINUTE - 4 * MINUTE),
			release,
			client: {
				browser,
				browserVersion: browser === 'Safari' ? '18' : '130',
				device: '',
				os,
				osVersion: '',
			},
			views,
			errors,
		}),
	);
}

function events(mapped: boolean, release: string): RumtypesErrorEventDTO[] {
	return SESSIONS.map(
		([sessionId, minutes, eventRelease, browser, os], index) => {
			const frames = httpFrames(mapped);
			return {
				id: `ev-${index + 1}`,
				timestamp: ago(minutes * MINUTE - 4 * MINUTE),
				sessionId,
				route: '/cart',
				release: index === 0 ? release : eventRelease,
				client: { browser, browserVersion: '130', device: '', os, osVersion: '' },
				type: 'HttpError',
				message: 'POST /api/cart returned 502',
				source: 'unhandledrejection',
				stacktrace: stacktrace(httpFrames(false)),
				frames,
				causes: [],
				symbolicated: mapped,
				missingSourceMap: mapped
					? null
					: {
							release: index === 0 ? release : eventRelease,
							kind: RumtypesArtifactKindDTO['source-map'],
						},
			};
		},
	);
}

function breadcrumbs(errorAt: number): RumtypesTimelineEventDTO[] {
	const at = (secondsBefore: number): string =>
		new Date(errorAt - secondsBefore * 1000).toISOString();
	const request = (
		secondsBefore: number,
		method: string,
		statusCode: number,
		durationMs: number,
		index: number,
	): RumtypesTimelineEventDTO => ({
		kind: RumtypesTimelineEventKindDTO.request,
		timestamp: at(secondsBefore),
		route: '/cart',
		request: {
			method,
			host: 'api.shop.example.com',
			path: '/api/cart',
			spanId: `b7ad6b716920330${index}`,
			traceId: `4bf92f3577b34da6a3ce929d0e0e4a${index}d`,
			url: 'https://api.shop.example.com/api/cart',
			statusCode,
			durationMs,
			failed: statusCode >= 400,
			hasBackend: true,
			backendService: 'cart-api',
		},
	});
	return [
		{
			kind: RumtypesTimelineEventKindDTO.view,
			timestamp: at(87.3),
			route: '/product/:id',
			view: {
				spanId: '00f067aa0ba902b1',
				path: '/product/90417',
				loadingType: RumtypesLoadingTypeDTO.route_change,
				durationMs: 46_100,
			},
		},
		{
			kind: RumtypesTimelineEventKindDTO.click,
			timestamp: at(72),
			route: '/product/:id',
			action: { type: 'click', name: '', target: 'button#add-to-cart' },
		},
		request(71.9, 'POST', 200, 210, 1),
		{
			kind: RumtypesTimelineEventKindDTO.view,
			timestamp: at(41.2),
			route: '/cart',
			view: {
				spanId: '00f067aa0ba902b2',
				path: '/cart',
				loadingType: RumtypesLoadingTypeDTO.route_change,
				durationMs: 41_200,
			},
		},
		request(41.1, 'GET', 200, 88, 2),
		{
			kind: RumtypesTimelineEventKindDTO.click,
			timestamp: at(0.7),
			route: '/cart',
			action: { type: 'click', name: '', target: 'button.qty-increase' },
		},
		request(0.7, 'POST', 502, 312, 3),
	];
}

/**
 * The HttpError group of web-shop; `mapped` symbolicates its frames, else
 * `release` has no source maps.
 */
export function rumErrorGroup(
	fingerprint: string,
	{
		mapped = true,
		release = '1.8.0',
	}: { mapped?: boolean; release?: string } = {},
): RumtypesGettableErrorGroupDTO {
	const group =
		RUM_ERROR_GROUPS.find((candidate) => candidate.fingerprint === fingerprint) ??
		RUM_ERROR_GROUPS[2];
	const latest = events(mapped, release);
	const crumbs = breadcrumbs(Date.parse(latest[0].timestamp));
	return {
		...group,
		latestEvents: latest,
		selectedEventId: latest[0].id,
		breadcrumbs: crumbs,
		linkedRequest: crumbs[crumbs.length - 1],
		affectedSessions: affectedSessions(),
	};
}

type ReleaseRow = [
	release: string,
	files: number,
	megabytes: number,
	uploadedDaysAgo: number,
	uploadedBy: string,
	lastUsedMs: number | null,
	expiresInDays: number | null,
];

const RELEASES: ReleaseRow[] = [
	['1.8.0', 14, 6.2, 1, 'ci-release@signozserviceaccount.com', 2 * MINUTE, null],
	['1.7.4', 13, 5.9, 9, 'ci-release@signozserviceaccount.com', 9 * MINUTE, null],
	['1.7.3', 13, 5.8, 16, 'admin@fusescope.local', 6 * DAY, null],
	['1.7.1', 12, 5.6, 30, 'ci-release@signozserviceaccount.com', 87 * DAY, 3],
];

const MB = 1024 * 1024;

const FILES: [string, number][] = [
	['main.4f9c2a', 2.1],
	['vendor.c2d81f', 3],
	['cart.9b1e07', 0.18],
	['checkout.e51a3b', 0.24],
];

export function rumSourceMapFiles(release: string): RumtypesSourceMapFileDTO[] {
	const row =
		RELEASES.find((candidate) => candidate[0] === release) ?? RELEASES[0];
	return FILES.map(([name, megabytes], index) => ({
		id: `${release}-file-${index + 1}`,
		kind: RumtypesArtifactKindDTO['source-map'],
		path: `/assets/${name}.js.map`,
		generatedPath: `/assets/${name}.js`,
		debugId: '',
		sizeBytes: Math.round(megabytes * MB),
		uploadedAt: ago(row[3] * DAY),
		uploadedBy: row[4],
		lastUsedAt: row[5] === null ? null : ago(row[5]),
	}));
}

/** web-shop's uploads; `empty` has none, `release` lists that release's files. */
export function rumSourceMaps({
	empty = false,
	release,
	without,
}: {
	empty?: boolean;
	release?: string;
	/** A release left out, e.g. one whose maps are missing. */
	without?: string;
} = {}): RumtypesGettableSourceMapsDTO {
	const rows = empty
		? []
		: RELEASES.filter(
				([name]) => name !== without && (!release || name === release),
			);
	const releases = rows.map(
		([
			name,
			files,
			megabytes,
			uploadedDaysAgo,
			uploadedBy,
			lastUsedMs,
			expiresInDays,
		]) => ({
			release: name,
			files,
			sizeBytes: Math.round(megabytes * MB),
			uploadedAt: ago(uploadedDaysAgo * DAY),
			uploadedBy,
			lastUsedAt: lastUsedMs === null ? null : ago(lastUsedMs),
			expiresAt:
				expiresInDays === null
					? null
					: new Date(Date.now() + expiresInDays * DAY).toISOString(),
		}),
	);
	return {
		releases,
		files: release && rows.length > 0 ? rumSourceMapFiles(release) : [],
		sizeBytes: releases.reduce((sum, row) => sum + row.sizeBytes, 0),
		limits: { maxFileSize: 50 * MB, maxFilesPerRelease: 1000, quota: 2048 * MB },
		settings: {
			retention: RumtypesSourceMapRetentionDTO['90d'],
			keepNewestReleases: true,
		},
	};
}
