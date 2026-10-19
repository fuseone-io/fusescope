import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';

import {
	applySeverityLevels,
	buildSeverityClause,
	groupSeverityCounts,
	parseSeverityClause,
	selectedSeverityLevels,
	withoutSeverityItems,
} from '../severityFilterQuery';

const FATAL_CLAUSE =
	"(severity_number IN [21, 22, 23, 24] OR (severity_number = 0 AND severity_text REGEXP '(?i)^(fatal|critical|crit|emerg|emergency|alert|panic)$'))";

function textItem(op: string, value: string[] | string): TagFilterItem {
	return {
		id: 'x',
		key: { key: 'severity_text', dataType: 'string', type: '' },
		op,
		value,
	} as TagFilterItem;
}

describe('buildSeverityClause', () => {
	it('matches every spelling of a level by number range or by text', () => {
		expect(buildSeverityClause(['FATAL'])).toBe(FATAL_CLAUSE);
	});

	it('joins levels in severity order', () => {
		expect(buildSeverityClause(['WARN', 'INFO'])).toBe(
			"(severity_number IN [9, 10, 11, 12, 13, 14, 15, 16] OR (severity_number = 0 AND severity_text REGEXP '(?i)^(info|information|notice|warn|warning|wrn)$'))",
		);
	});

	it('selects unknown severities as text-only logs that name no level', () => {
		expect(buildSeverityClause(['UNKNOWN'])).toMatch(
			/^\(\(severity_number = 0 AND severity_text NOT REGEXP '\(\?i\)\^\(trace\|.*\|panic\)\$'\)\)$/,
		);
	});
});

describe('parseSeverityClause', () => {
	it('reads the levels back out of a clause it built', () => {
		const expression = `service.name = 'api' AND ${buildSeverityClause([
			'ERROR',
			'FATAL',
			'UNKNOWN',
		])}`;

		expect(parseSeverityClause(expression)?.levels).toStrictEqual([
			'ERROR',
			'FATAL',
			'UNKNOWN',
		]);
	});

	it('finds nothing in an expression without one', () => {
		expect(parseSeverityClause("service.name = 'api'")).toBeNull();
	});
});

describe('applySeverityLevels', () => {
	it('adds the clause after the rest of the expression', () => {
		expect(applySeverityLevels("service.name = 'api'", ['FATAL'])).toBe(
			`service.name = 'api' AND ${FATAL_CLAUSE}`,
		);
	});

	it('replaces its own clause instead of stacking another', () => {
		const once = applySeverityLevels("service.name = 'api'", ['FATAL']);
		expect(applySeverityLevels(once, ['FATAL'])).toBe(once);
	});

	it('drops the clause when every level is selected again', () => {
		const once = applySeverityLevels("service.name = 'api'", ['FATAL']);
		expect(applySeverityLevels(once, null)).toBe("service.name = 'api'");
	});

	it('replaces a severity_text selection from an old url', () => {
		expect(
			applySeverityLevels(
				"severity_text IN ['Fatal', 'FATAL'] AND service.name = 'api'",
				['FATAL'],
			),
		).toBe(`service.name = 'api' AND ${FATAL_CLAUSE}`);
	});
});

describe('selectedSeverityLevels', () => {
	it('reads the levels of a clause in the expression', () => {
		expect(
			selectedSeverityLevels(applySeverityLevels('', ['WARN']), []),
		).toStrictEqual(['WARN']);
	});

	it('maps a severity_text selection from an old url to its levels', () => {
		expect(
			selectedSeverityLevels("severity_text IN ['Fatal', 'FATAL', 'Warn']", [
				textItem('in', ['Fatal', 'FATAL', 'Warn']),
			]),
		).toStrictEqual(['WARN', 'FATAL']);
	});

	it('maps an old severity_text exclusion to the remaining levels', () => {
		expect(
			selectedSeverityLevels("severity_text NOT IN ['INFO']", [
				textItem('not in', ['INFO']),
			]),
		).toStrictEqual(['TRACE', 'DEBUG', 'WARN', 'ERROR', 'FATAL', 'UNKNOWN']);
	});

	it('selects everything when nothing filters severity', () => {
		expect(selectedSeverityLevels("service.name = 'api'", [])).toBeNull();
	});
});

describe('groupSeverityCounts', () => {
	it('sums every spelling into its level and keeps unknown apart', () => {
		expect(
			groupSeverityCounts([
				{ severityNumber: 21, severityText: 'Fatal', count: 2 },
				{ severityNumber: 21, severityText: 'FATAL', count: 3 },
				{ severityNumber: 0, severityText: 'critical', count: 1 },
				{ severityNumber: 9, severityText: 'Info', count: 10 },
				{ severityNumber: 0, severityText: 'verbose', count: 4 },
			]),
		).toStrictEqual([
			{ level: 'INFO', count: 10 },
			{ level: 'FATAL', count: 6 },
			{ level: 'UNKNOWN', count: 4 },
		]);
	});
});

describe('withoutSeverityItems', () => {
	it('drops the severity items the builder mirrored from the clause', () => {
		const numberItem = {
			...textItem('in', ['21']),
			key: { key: 'severity_number', dataType: 'int64', type: '' },
		} as TagFilterItem;
		const serviceItem = {
			...textItem('=', 'api'),
			key: { key: 'service.name', dataType: 'string', type: '' },
		} as TagFilterItem;

		expect(
			withoutSeverityItems([textItem('in', ['FATAL']), numberItem, serviceItem]),
		).toStrictEqual([serviceItem]);
	});
});
