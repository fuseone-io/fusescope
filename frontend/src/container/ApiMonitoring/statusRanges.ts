import { FS_SERIES_DARK, FS_SERIES_LIGHT } from 'constants/fuseScopeColors';

/** The ranges the status charts group codes into, in display order. */
export const STATUS_RANGES = [
	{ key: '200-299', label: '2xx' },
	{ key: '300-399', label: '3xx' },
	{ key: '400-499', label: '4xx' },
	{ key: '500-599', label: '5xx' },
	{ key: 'Other', label: 'Other' },
] as const;

/** The chart palette leaves red out; failed calls are the one place it belongs. */
const ERROR_RED = '#dc2626';

export function statusRangeOf(statusCode: string): string {
	const code = parseInt(statusCode, 10);
	if (Number.isNaN(code) || code < 200 || code >= 600) {
		return 'Other';
	}
	const hundred = Math.floor(code / 100) * 100;
	return `${hundred}-${hundred + 99}`;
}

export function statusRangeColors(isDark: boolean): Record<string, string> {
	const palette = isDark ? FS_SERIES_DARK : FS_SERIES_LIGHT;
	return {
		'200-299': palette.green,
		'300-399': palette.sky,
		'400-499': palette.amber,
		'500-599': ERROR_RED,
		Other: palette.slate,
	};
}
