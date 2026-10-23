import { compareReleases, newestReleasesFirst } from '../releases';

describe('compareReleases', () => {
	it.each<[string, string[], string[]]>([
		[
			'semver numerically, not as text',
			['10.0.0', '9.0.0', '9.10.0', '9.2.0'],
			['9.0.0', '9.2.0', '9.10.0', '10.0.0'],
		],
		[
			'a v prefix and build metadata',
			['v1.10.0', '1.9.0+build.7', 'v1.2.0'],
			['v1.2.0', '1.9.0+build.7', 'v1.10.0'],
		],
		[
			'prereleases before their release',
			['1.0.0', '1.0.0-rc.10', '1.0.0-rc.2', '1.0.0-beta'],
			['1.0.0-beta', '1.0.0-rc.2', '1.0.0-rc.10', '1.0.0'],
		],
		['short versions', ['2', '1.10', '1.9.1'], ['1.9.1', '1.10', '2']],
		[
			'other releases as text, below semver',
			['1.0.0', 'main-b2', 'main-a1', '0.9.0'],
			['main-a1', 'main-b2', '0.9.0', '1.0.0'],
		],
	])('orders %s', (_, releases, expected) => {
		expect([...releases].sort(compareReleases)).toStrictEqual(expected);
	});
});

describe('newestReleasesFirst', () => {
	it('puts the highest version first without changing its input', () => {
		const releases = ['9.0.0', '10.0.0'];
		expect(newestReleasesFirst(releases)).toStrictEqual(['10.0.0', '9.0.0']);
		expect(releases).toStrictEqual(['9.0.0', '10.0.0']);
	});
});
