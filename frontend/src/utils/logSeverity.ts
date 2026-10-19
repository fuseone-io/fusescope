/**
 * Log severity as one of six OTel levels. `severity_text` is free text (Info,
 * INFO, information…), so the UI groups, colours and filters by the level the
 * `severity_number` range names, falling back to the text when the number is 0.
 * Text that names no level is UNKNOWN rather than kept raw, so every place
 * that shows a level has a closed set to colour and count.
 */
export const SEVERITY_LEVELS = [
	'TRACE',
	'DEBUG',
	'INFO',
	'WARN',
	'ERROR',
	'FATAL',
] as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];
export type NormalizedSeverity = SeverityLevel | 'UNKNOWN';

/** Inclusive `severity_number` range of each level (OTel logs data model). */
export const SEVERITY_NUMBER_RANGES: Record<SeverityLevel, [number, number]> = {
	TRACE: [1, 4],
	DEBUG: [5, 8],
	INFO: [9, 12],
	WARN: [13, 16],
	ERROR: [17, 20],
	FATAL: [21, 24],
};

/** Lower-case spellings of each level, for logs without a severity_number. */
export const SEVERITY_TEXT_SYNONYMS: Record<SeverityLevel, string[]> = {
	TRACE: ['trace', 'trc'],
	DEBUG: ['debug', 'dbg'],
	INFO: ['info', 'information', 'notice'],
	WARN: ['warn', 'warning', 'wrn'],
	ERROR: ['error', 'err', 'fail'],
	FATAL: ['fatal', 'critical', 'crit', 'emerg', 'emergency', 'alert', 'panic'],
};

const LEVEL_BY_TEXT = new Map<string, SeverityLevel>(
	SEVERITY_LEVELS.flatMap((level) =>
		SEVERITY_TEXT_SYNONYMS[level].map((text) => [text, level] as const),
	),
);

export function levelFromSeverityNumber(
	severityNumber: number,
): SeverityLevel | undefined {
	return SEVERITY_LEVELS.find((level) => {
		const [min, max] = SEVERITY_NUMBER_RANGES[level];
		return severityNumber >= min && severityNumber <= max;
	});
}

export function levelFromSeverityText(
	severityText: string,
): SeverityLevel | undefined {
	return LEVEL_BY_TEXT.get(severityText.trim().toLowerCase());
}

export function normalizeSeverity(
	severityNumber?: number | null,
	severityText?: string | null,
): NormalizedSeverity {
	if (severityNumber) {
		const level = levelFromSeverityNumber(severityNumber);
		if (level) {
			return level;
		}
	}
	return levelFromSeverityText(severityText ?? '') ?? 'UNKNOWN';
}
