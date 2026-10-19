import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';
import {
	levelFromSeverityNumber,
	NormalizedSeverity,
	normalizeSeverity,
	SEVERITY_LEVELS,
	SEVERITY_NUMBER_RANGES,
	SEVERITY_TEXT_SYNONYMS,
	SeverityLevel,
} from 'utils/logSeverity';

import {
	NON_SELECTED_OPERATORS,
	removeManagedClauses,
	SELECTED_OPERATORS,
} from '../Checkbox/checkboxFilterQuery';
import { isKeyMatch } from '../Checkbox/utils';

export const SEVERITY_FILTER_KEY = 'severity_text';
const SEVERITY_NUMBER_KEY = 'severity_number';

/**
 * Filter items without the severity keys. The query builder mirrors the
 * expression into items and falls back to them when the expression is empty,
 * so a cleared severity clause must not survive there.
 */
export function withoutSeverityItems(items: TagFilterItem[]): TagFilterItem[] {
	return items.filter(
		(item) =>
			!isKeyMatch(item.key?.key, SEVERITY_FILTER_KEY) &&
			!isKeyMatch(item.key?.key, SEVERITY_NUMBER_KEY),
	);
}

/** The levels the facet lists, in severity order. */
export const SEVERITY_FILTER_LEVELS: NormalizedSeverity[] = [
	...SEVERITY_LEVELS,
	'UNKNOWN',
];

const textPattern = (levels: readonly SeverityLevel[]): string =>
	`(?i)^(${levels.flatMap((level) => SEVERITY_TEXT_SYNONYMS[level]).join('|')})$`;

function numbersOf(level: SeverityLevel): number[] {
	const [min, max] = SEVERITY_NUMBER_RANGES[level];
	return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

/**
 * One parenthesised clause matching the levels in every spelling: by the
 * `severity_number` range, or by the text for logs that carry no number.
 */
export function buildSeverityClause(levels: NormalizedSeverity[]): string {
	const known = SEVERITY_LEVELS.filter((level) => levels.includes(level));
	const parts: string[] = [];

	if (known.length) {
		parts.push(`severity_number IN [${known.flatMap(numbersOf).join(', ')}]`);
		parts.push(
			`(severity_number = 0 AND severity_text REGEXP '${textPattern(known)}')`,
		);
	}
	if (levels.includes('UNKNOWN')) {
		parts.push(
			`(severity_number = 0 AND severity_text NOT REGEXP '${textPattern(
				SEVERITY_LEVELS,
			)}')`,
		);
	}

	return `(${parts.join(' OR ')})`;
}

const CLAUSE_PART =
	"(?:severity_number IN \\[[0-9, ]+\\]|\\(severity_number = 0 AND severity_text (?:NOT )?REGEXP '[^']*'\\))";
const CLAUSE_RE = new RegExp(`\\(${CLAUSE_PART}(?: OR ${CLAUSE_PART})*\\)`);

/** The clause `buildSeverityClause` wrote into `expression`, with its levels. */
export function parseSeverityClause(
	expression: string,
): { clause: string; levels: NormalizedSeverity[] } | null {
	const match = CLAUSE_RE.exec(expression);
	if (!match) {
		return null;
	}
	const clause = match[0];
	const numbers = /severity_number IN \[([0-9, ]+)\]/
		.exec(clause)?.[1]
		.split(',')
		.map((n) => Number(n.trim()));
	const levels = new Set<NormalizedSeverity>();
	numbers?.forEach((n) => {
		const level = levelFromSeverityNumber(n);
		if (level) {
			levels.add(level);
		}
	});
	if (clause.includes('NOT REGEXP')) {
		levels.add('UNKNOWN');
	}
	return {
		clause,
		levels: SEVERITY_FILTER_LEVELS.filter((level) => levels.has(level)),
	};
}

function joinWithAnd(left: string, right: string): string {
	return [left.trim(), right.trim()].filter(Boolean).join(' AND ');
}

function withoutSeverityClause(expression: string): string {
	const parsed = parseSeverityClause(expression);
	if (!parsed) {
		return expression;
	}
	const [before, after] = expression.split(parsed.clause);
	return joinWithAnd(
		before.replace(/\s*AND\s*$/i, ''),
		after.replace(/^\s*AND\s*/i, ''),
	);
}

/**
 * `expression` filtered to `levels`; `null` (every level) removes the filter.
 * A `severity_text` selection from before normalisation is replaced too.
 */
export function applySeverityLevels(
	expression: string,
	levels: NormalizedSeverity[] | null,
): string {
	const rest = removeManagedClauses(
		withoutSeverityClause(expression),
		SEVERITY_FILTER_KEY,
	).trim();
	if (!levels || levels.length === SEVERITY_FILTER_LEVELS.length) {
		return rest;
	}
	return joinWithAnd(rest, buildSeverityClause(levels));
}

function levelsOfTexts(values: unknown): Set<NormalizedSeverity> {
	const list = Array.isArray(values) ? values : [values];
	return new Set(list.map((value) => normalizeSeverity(0, String(value))));
}

/**
 * The levels the query selects, or `null` when it does not filter severity.
 * Reads this facet's clause, else a `severity_text` selection from an old url.
 */
export function selectedSeverityLevels(
	expression: string,
	filterItems: TagFilterItem[],
): NormalizedSeverity[] | null {
	const parsed = parseSeverityClause(expression);
	if (parsed) {
		return parsed.levels;
	}

	const legacy = filterItems.find((item) =>
		isKeyMatch(item.key?.key, SEVERITY_FILTER_KEY),
	);
	if (!legacy) {
		return null;
	}
	const levels = levelsOfTexts(legacy.value);
	if (SELECTED_OPERATORS.includes(legacy.op.toLowerCase())) {
		return SEVERITY_FILTER_LEVELS.filter((level) => levels.has(level));
	}
	if (NON_SELECTED_OPERATORS.includes(legacy.op.toLowerCase())) {
		return SEVERITY_FILTER_LEVELS.filter((level) => !levels.has(level));
	}
	return null;
}

export interface SeverityCountRow {
	severityNumber: number;
	severityText: string;
	count: number;
}

/** Counts per level, every spelling summed, in severity order. */
export function groupSeverityCounts(
	rows: SeverityCountRow[],
): { level: NormalizedSeverity; count: number }[] {
	const totals = new Map<NormalizedSeverity, number>();
	rows.forEach(({ severityNumber, severityText, count }) => {
		const level = normalizeSeverity(severityNumber, severityText);
		totals.set(level, (totals.get(level) ?? 0) + count);
	});
	return SEVERITY_FILTER_LEVELS.filter((level) => totals.has(level)).map(
		(level) => ({ level, count: totals.get(level) ?? 0 }),
	);
}
