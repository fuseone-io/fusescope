import { SdkSupport, SupportedSdk } from './types';

function parseVersion(version: string): number[] | undefined {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
	return match ? match.slice(1, 4).map(Number) : undefined;
}

function compare(a: number[], b: number[]): number {
	for (let index = 0; index < 3; index += 1) {
		if (a[index] !== b[index]) {
			return a[index] - b[index];
		}
	}
	return 0;
}

/** How a seen SDK compares with the versions this server supports. */
export function sdkSupport(
	name: string,
	version: string,
	supported: SupportedSdk[],
): SdkSupport {
	const parsed = parseVersion(version);
	if (!name || !parsed) {
		return 'unknown';
	}
	const range = supported.find((sdk) => sdk.name === name);
	const min = range && parseVersion(range.minVersion);
	const max = range && parseVersion(range.maxVersion);
	if (!min || !max) {
		return 'other';
	}
	if (compare(parsed, min) < 0) {
		return 'outdated';
	}
	return compare(parsed, max) < 0 ? 'supported' : 'other';
}
