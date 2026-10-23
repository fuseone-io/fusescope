interface ReleaseVersion {
	core: number[];
	prerelease: string[];
}

const VERSION =
	/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const NUMERIC = /^\d+$/;

function parseRelease(release: string): ReleaseVersion | undefined {
	const match = VERSION.exec(release);
	if (!match) {
		return undefined;
	}
	return {
		core: match.slice(1, 4).map((part) => Number(part ?? 0)),
		prerelease: match[4] ? match[4].split('.') : [],
	};
}

const sign = (value: number): number => Math.sign(value);

const compareText = (a: string, b: string): number =>
	a < b ? -1 : a > b ? 1 : 0;

function compareIdentifiers(a: string, b: string): number {
	const numericA = NUMERIC.test(a);
	const numericB = NUMERIC.test(b);
	if (numericA && numericB) {
		return sign(Number(a) - Number(b));
	}
	if (numericA !== numericB) {
		return numericA ? -1 : 1;
	}
	return compareText(a, b);
}

function compareVersions(a: ReleaseVersion, b: ReleaseVersion): number {
	for (let index = 0; index < 3; index += 1) {
		if (a.core[index] !== b.core[index]) {
			return sign(a.core[index] - b.core[index]);
		}
	}
	if (a.prerelease.length === 0 || b.prerelease.length === 0) {
		return sign(b.prerelease.length - a.prerelease.length);
	}
	const shared = Math.min(a.prerelease.length, b.prerelease.length);
	for (let index = 0; index < shared; index += 1) {
		const order = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
		if (order !== 0) {
			return order;
		}
	}
	return sign(a.prerelease.length - b.prerelease.length);
}

/**
 * Oldest first: semantic versions by precedence (a missing minor or patch is
 * 0, build metadata is ignored), any other release by text, below them all.
 * Matches the backend's `rumtypes.CompareReleases`.
 */
export function compareReleases(a: string, b: string): number {
	const versionA = parseRelease(a);
	const versionB = parseRelease(b);
	if (versionA && versionB) {
		return compareVersions(versionA, versionB) || compareText(a, b);
	}
	if (versionA || versionB) {
		return versionA ? 1 : -1;
	}
	return compareText(a, b);
}

export const newestReleasesFirst = (releases: string[]): string[] =>
	[...releases].sort((a, b) => compareReleases(b, a));
