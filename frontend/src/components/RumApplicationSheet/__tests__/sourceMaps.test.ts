import {
	expiresInDays,
	formatBytes,
	isSourceMapFile,
	latestRelease,
	mapPath,
} from '../utils/sourceMaps';

describe('formatBytes', () => {
	it.each([
		[0, '0 B'],
		[812, '812 B'],
		[188_416, '184 KB'],
		[6_501_171, '6.2 MB'],
		[2_147_483_648, '2 GB'],
	])('%d', (bytes, text) => {
		expect(formatBytes(bytes)).toBe(text);
	});
});

describe('expiresInDays', () => {
	const now = Date.parse('2026-10-23T12:00:00Z');
	it.each([
		[null, undefined],
		['2026-10-26T11:00:00Z', 3],
		['2026-10-23T13:00:00Z', 1],
		['2026-10-22T12:00:00Z', 0],
	])('%s', (expiresAt, days) => {
		expect(expiresInDays(expiresAt, now)).toBe(days);
	});
});

describe('latestRelease', () => {
	it('is the release uploaded last', () => {
		expect(
			latestRelease([
				{ release: '1.7.4', uploadedAt: '2026-10-14T09:41:00Z' },
				{ release: '1.8.0', uploadedAt: '2026-10-22T08:58:00Z' },
			]),
		).toBe('1.8.0');
		expect(latestRelease([])).toBeUndefined();
	});
});

describe('mapPath', () => {
	it.each([
		['/assets/', 'index-abc.js.map', '/assets/index-abc.js.map'],
		['assets', 'index-abc.js.map', '/assets/index-abc.js.map'],
		['/', 'main.js.map', '/main.js.map'],
		['', 'main.js.map', '/main.js.map'],
		['https://cdn.example.com/app/', 'main.js.map', '/app/main.js.map'],
	])('%s + %s', (prefix, name, path) => {
		expect(mapPath(prefix, name)).toBe(path);
	});
});

describe('isSourceMapFile', () => {
	it.each([
		['main.js.map', true],
		['main.mjs.map', true],
		['main.cjs.map', true],
		['main.css.map', false],
		['main.js', false],
	])('%s', (name, map) => {
		expect(isSourceMapFile(name)).toBe(map);
	});
});
