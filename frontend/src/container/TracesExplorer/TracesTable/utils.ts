import { RESPONSE_CODE_FIELD_NAMES } from './constants';

export function stringifyCellValue(value: unknown): string {
	if (value == null) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return JSON.stringify(value);
}

function isTrue(value: unknown): boolean {
	return value === true || value === 'true';
}

/** An error span: OTel error status, or a 5xx HTTP response. */
export function isErrorSpan(row: Record<string, unknown>): boolean {
	if (row.has_error !== undefined || row.hasError !== undefined) {
		return isTrue(row.has_error) || isTrue(row.hasError);
	}
	const status = row.status_code_string ?? row.statusCodeString;
	if (status !== undefined) {
		return status === 'Error';
	}
	return [...RESPONSE_CODE_FIELD_NAMES].some(
		(field) => Number(row[field]) >= 500,
	);
}

/** Badge for `has_error` / `status_code_string`. */
export function spanStatus(text: string): {
	tone: 'error' | 'success' | 'neutral';
	label: string;
} {
	if (text === 'true' || text === 'Error') {
		return { tone: 'error', label: 'Error' };
	}
	if (text === 'false' || text === 'Ok') {
		return { tone: 'success', label: 'Ok' };
	}
	return { tone: 'neutral', label: text };
}
