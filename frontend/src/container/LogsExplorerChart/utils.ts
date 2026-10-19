import { QueryData } from 'types/api/widgets/getQuery';
import {
	NormalizedSeverity,
	normalizeSeverity,
	SEVERITY_LEVELS,
} from 'utils/logSeverity';
import { FsChartColor } from 'constants/fuseScopeColors';
import { colors } from 'lib/getRandomColor';

// Function to determine if a color is "red-like" based on its RGB values
export function isRedLike(hex: string): boolean {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return r > 180 && r > g * 1.4 && r > b * 1.4;
}

const SAFE_FALLBACK_COLORS = colors.filter((c) => !isRedLike(c));

type Severity = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

// The `--fs-*` severity tokens per theme; uPlot needs concrete colours.
const SEVERITY_PALETTE: Record<'dark' | 'light', Record<Severity, string>> = {
	dark: {
		TRACE: '#8e98a8',
		DEBUG: '#b8bfcc',
		INFO: '#3d8be0',
		WARN: '#d97706',
		ERROR: '#dc2626',
		FATAL: '#c04fe0',
	},
	light: {
		TRACE: '#64707f',
		DEBUG: '#4b5563',
		INFO: '#0f5fb8',
		WARN: '#d97706',
		ERROR: '#dc2626',
		FATAL: '#950fb8',
	},
};

const SEVERITY_VARIANTS: Record<string, Severity> = {
	TRACE: 'TRACE',
	Trace: 'TRACE',
	trace: 'TRACE',
	trc: 'TRACE',
	Trc: 'TRACE',

	DEBUG: 'DEBUG',
	Debug: 'DEBUG',
	debug: 'DEBUG',
	dbg: 'DEBUG',
	Dbg: 'DEBUG',

	INFO: 'INFO',
	Info: 'INFO',
	info: 'INFO',
	Information: 'INFO',
	information: 'INFO',

	WARN: 'WARN',
	Warn: 'WARN',
	warn: 'WARN',
	warning: 'WARN',
	Warning: 'WARN',
	WARNING: 'WARN',
	wrn: 'WARN',
	Wrn: 'WARN',

	ERROR: 'ERROR',
	Error: 'ERROR',
	error: 'ERROR',
	err: 'ERROR',
	Err: 'ERROR',
	ERR: 'ERROR',
	fail: 'ERROR',
	Fail: 'ERROR',
	FAIL: 'ERROR',

	FATAL: 'FATAL',
	Fatal: 'FATAL',
	fatal: 'FATAL',
	critical: 'FATAL',
	Critical: 'FATAL',
	CRITICAL: 'FATAL',
	crit: 'FATAL',
	Crit: 'FATAL',
	CRIT: 'FATAL',
	panic: 'FATAL',
	Panic: 'FATAL',
	PANIC: 'FATAL',
};

const LEGACY_LABEL_SEVERITIES: [string, Severity][] = [
	['{severity_text="trace"}', 'TRACE'],
	['{severity_text="debug"}', 'DEBUG'],
	['{severity_text="info"}', 'INFO'],
	['{severity_text=""}', 'INFO'],
	['{severity_text="warn"}', 'WARN'],
	['{severity_text="error"}', 'ERROR'],
	['{severity_text="fatal"}', 'FATAL'],
];

function paletteFor(isDarkMode: boolean): Record<Severity, string> {
	return SEVERITY_PALETTE[isDarkMode ? 'dark' : 'light'];
}

// Simple function to get severity color for any component
export function getSeverityColor(
	severityText: string,
	isDarkMode = true,
): string {
	const severity = SEVERITY_VARIANTS[severityText.trim()];
	return paletteFor(isDarkMode)[severity ?? 'INFO'];
}

export function getColorsForSeverityLabels(
	label: string,
	index: number,
	isDarkMode = true,
): string {
	const trimmed = label.trim();

	if (!trimmed) {
		return FsChartColor.BG_VANILLA_400; // Default color for empty labels
	}

	const palette = paletteFor(isDarkMode);
	if (trimmed === 'UNKNOWN') {
		return FsChartColor.BG_SLATE_50;
	}
	const severity = SEVERITY_VARIANTS[trimmed];
	if (severity) {
		return palette[severity];
	}

	// Fallback to old format for backward compatibility
	const lowerCaseLabel = label.toLowerCase();
	const legacy = LEGACY_LABEL_SEVERITIES.find(([needle]) =>
		lowerCaseLabel.includes(needle),
	);
	if (legacy) {
		return palette[legacy[1]];
	}

	return (
		SAFE_FALLBACK_COLORS[index % SAFE_FALLBACK_COLORS.length] ||
		FsChartColor.BG_VANILLA_400
	);
}

/**
 * Regroups series split by `severity_text` (and `severity_number`) into one
 * series per normalised level, summing every spelling, in severity order.
 */
export function groupSeriesBySeverity(series: QueryData[]): QueryData[] {
	const byLevel = new Map<NormalizedSeverity, Map<number, number>>();

	series.forEach((item) => {
		const level = normalizeSeverity(
			Number(item.metric?.severity_number) || 0,
			item.metric?.severity_text,
		);
		const totals = byLevel.get(level) ?? new Map<number, number>();
		item.values.forEach(([timestamp, value]) => {
			totals.set(timestamp, (totals.get(timestamp) ?? 0) + (Number(value) || 0));
		});
		byLevel.set(level, totals);
	});

	const template = series[0];
	return [...SEVERITY_LEVELS, 'UNKNOWN' as const]
		.filter((level) => byLevel.has(level))
		.map((level) => ({
			...template,
			metric: { severity_text: level },
			values: [...(byLevel.get(level)?.entries() ?? [])]
				.sort(([a], [b]) => a - b)
				.map(([timestamp, total]): [number, string] => [timestamp, String(total)]),
		}));
}
