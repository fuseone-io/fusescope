import { RumtypesSourceMapRetentionDTO } from 'api/generated/services/fuseScope.schemas';

const DAY = 86_400_000;
const UNITS = ['B', 'KB', 'MB', 'GB'];

export const RETENTION_OPTIONS = [
	{ value: RumtypesSourceMapRetentionDTO['30d'], label: '30 days' },
	{ value: RumtypesSourceMapRetentionDTO['90d'], label: '90 days' },
	{ value: RumtypesSourceMapRetentionDTO['1y'], label: '1 year' },
	{ value: RumtypesSourceMapRetentionDTO.never, label: 'Never' },
];

/** Releases expiring within this many days get a warning. */
export const EXPIRY_WARNING_DAYS = 7;

/** "184 KB", "6.2 MB": one decimal under 10 of a unit. */
export function formatBytes(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	if (unit === 0) {
		return `${value} B`;
	}
	const text = value < 10 ? value.toFixed(1) : String(Math.round(value));
	return `${text.replace(/\.0$/, '')} ${UNITS[unit]}`;
}

/** Whole days left, rounded up; 0 once past. */
export function expiresInDays(
	expiresAt: string | null,
	now = Date.now(),
): number | undefined {
	if (!expiresAt) {
		return undefined;
	}
	return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / DAY));
}

export function latestRelease(
	releases: { release: string; uploadedAt: string }[],
): string | undefined {
	return [...releases].sort(
		(a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt),
	)[0]?.release;
}

/** The URL path a map is stored under: the path its bundle is served from plus its name. */
export function mapPath(prefix: string, name: string): string {
	let path = prefix.trim();
	if (/^[a-z]+:\/\//i.test(path)) {
		path = new URL(path).pathname;
	}
	path = `/${path}/`.replace(/\/+/g, '/');
	return path + name;
}

export const isSourceMapFile = (name: string): boolean =>
	/\.[cm]?js\.map$/.test(name);
