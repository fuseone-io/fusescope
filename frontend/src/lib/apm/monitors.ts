interface LegacyFilterItem {
	key?: { key?: string };
	op?: string;
	value?: unknown;
}

/** The parts of an alert rule the Monitors panel reads. */
export interface RuleLike {
	id: string;
	alert: string;
	state: string;
	labels?: Record<string, string> | null;
	condition: {
		compositeQuery: {
			queries?: { spec?: unknown }[] | null;
			builderQueries?: Record<
				string,
				{ filters?: { items?: LegacyFilterItem[] | null } | null }
			> | null;
		};
	};
}

const SERVICE_KEYS = ['service.name', 'serviceName', 'service_name'];
const EQUALS = ['=', '==', 'in'];

function filterExpressions(rule: RuleLike): string[] {
	return (rule.condition?.compositeQuery?.queries ?? [])
		.map((query) => {
			const spec = query.spec as { filter?: { expression?: unknown } } | undefined;
			const expression = spec?.filter?.expression;
			return typeof expression === 'string' ? expression : '';
		})
		.filter(Boolean);
}

const unquote = (text: string): string[] =>
	Array.from(text.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)).map(
		(match) => (match[1] ?? match[2]).replace(/\\(.)/g, '$1'),
	);

/** `service.name = 'x'` or `service.name IN [...]` naming the service. */
function expressionMatches(expression: string, servicename: string): boolean {
	const clause =
		/(?:^|[\s(])service\.name\s*(==|=|in\b|IN\b)\s*(\[[^\]]*\]|\([^)]*\)|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
	return Array.from(expression.matchAll(clause)).some((match) =>
		unquote(match[2]).includes(servicename),
	);
}

function legacyMatches(rule: RuleLike, servicename: string): boolean {
	return Object.values(
		rule.condition?.compositeQuery?.builderQueries ?? {},
	).some((query) =>
		(query.filters?.items ?? []).some((item) => {
			const values = Array.isArray(item.value) ? item.value : [item.value];
			return (
				SERVICE_KEYS.includes(item.key?.key ?? '') &&
				EQUALS.includes((item.op ?? '').toLowerCase()) &&
				values.map(String).includes(servicename)
			);
		}),
	);
}

/** Whether a rule is scoped to the service by its filter or its labels. */
export function matchesService(rule: RuleLike, servicename: string): boolean {
	if (SERVICE_KEYS.some((key) => rule.labels?.[key] === servicename)) {
		return true;
	}
	return (
		filterExpressions(rule).some((expression) =>
			expressionMatches(expression, servicename),
		) || legacyMatches(rule, servicename)
	);
}

const STATE_ORDER: Record<string, number> = {
	firing: 0,
	pending: 1,
	recovering: 2,
	nodata: 3,
	inactive: 4,
	disabled: 5,
};

/** The service's rules, the ones needing attention first. */
export function serviceMonitors<Rule extends RuleLike>(
	rules: Rule[],
	servicename: string,
): Rule[] {
	return rules
		.filter((rule) => matchesService(rule, servicename))
		.sort(
			(a, b) =>
				(STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9) ||
				a.alert.localeCompare(b.alert),
		);
}

/** The rule's first filter, as the panel's one-line description of it. */
export function ruleFilterSummary(rule: RuleLike): string {
	return filterExpressions(rule)[0] ?? '';
}
