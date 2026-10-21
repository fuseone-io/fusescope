import { knownVariableOptions } from '../../../VariablesBar/utils/knownVariableOptions';
import {
	DYNAMIC_SIGNAL_LABEL,
	sortValuesByOrder,
	type VariableFormModel,
	type VariableSort,
} from '../variableFormModel';

export interface VariableRowSummary {
	/** Where the values come from, on one line. */
	source: string;
	/** The first few values. */
	values: string[];
	/** How many values `values` leaves out. */
	moreCount: number;
}

const PREVIEW_COUNT = 4;

function sourceOf(variable: VariableFormModel, customCount: number): string {
	switch (variable.type) {
		case 'DYNAMIC':
			return variable.dynamicAttribute
				? `${variable.dynamicAttribute} from ${DYNAMIC_SIGNAL_LABEL[variable.dynamicSignal]}`
				: 'No field selected';
		case 'QUERY':
			return variable.queryValue.trim()
				? variable.queryValue.replace(/\s+/g, ' ').trim()
				: 'No query';
		case 'CUSTOM':
			return `Custom list · ${customCount} value${customCount === 1 ? '' : 's'}`;
		default:
			return variable.textValue
				? `Default: ${variable.textValue}`
				: 'No default value';
	}
}

/**
 * What a row of the variables list says about a variable. `fetchedOptions` are
 * the QUERY/DYNAMIC values already loaded by the variables bar, if any.
 */
export function summarizeVariable(
	variable: VariableFormModel,
	fetchedOptions?: string[],
): VariableRowSummary {
	const custom = knownVariableOptions(variable);
	let all: string[] = [];
	if (variable.type === 'CUSTOM') {
		all = custom;
	} else if (variable.type !== 'TEXT') {
		all = fetchedOptions ?? [];
	}

	return {
		source: sourceOf(variable, custom.length),
		values: all.slice(0, PREVIEW_COUNT),
		moreCount: Math.max(0, all.length - PREVIEW_COUNT),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function asValues(value: unknown): (string | number)[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value.filter(
		(item): item is string | number =>
			typeof item === 'string' || typeof item === 'number',
	);
}

/** Options from a cached QUERY variable response (`dashboardVariablesQuery`). */
export function cachedOptionsFromQueryResponse(
	data: unknown,
	sort: VariableSort,
): string[] | undefined {
	if (!isRecord(data) || data.statusCode !== 200 || !isRecord(data.payload)) {
		return undefined;
	}
	const values = asValues(data.payload.variableValues) ?? [];
	return sortValuesByOrder(values, sort).map(String);
}

/** Options from a cached DYNAMIC variable response (`getFieldValues`). */
export function cachedOptionsFromDynamicResponse(
	data: unknown,
	sort: VariableSort,
): string[] | undefined {
	if (!isRecord(data) || !isRecord(data.data)) {
		return undefined;
	}
	const payload = data.data;
	const values =
		asValues(payload.normalizedValues) ??
		(isRecord(payload.values)
			? asValues(payload.values.StringValues)
			: undefined) ??
		[];
	return sortValuesByOrder(values, sort).map(String);
}
