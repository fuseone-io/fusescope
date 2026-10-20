export interface StatusMessageCount {
	message: string;
	operation: string;
	count: number;
}

/**
 * `recorded`: an exception with this message was recorded on the service;
 * `none`: the service recorded no exception at all; `unmatched`: it did, but
 * not with this message.
 */
export type ExceptionMatch = 'recorded' | 'none' | 'unmatched';

export interface ErrorMessageRow extends StatusMessageCount {
	key: string;
	/** Share of all error spans, 0–100. */
	share: number;
	exception: ExceptionMatch;
}

/** Error spans by status message, matched to recorded exception messages. */
export function errorMessageRows(
	counts: StatusMessageCount[],
	exceptionMessages: string[],
): ErrorMessageRow[] {
	const total = counts.reduce((sum, item) => sum + item.count, 0);
	const recorded = new Set(exceptionMessages.filter(Boolean));
	const exceptionFor = (message: string): ExceptionMatch => {
		if (recorded.size === 0) {
			return 'none';
		}
		return recorded.has(message) ? 'recorded' : 'unmatched';
	};
	return counts.map((item) => ({
		key: `${item.message}|${item.operation}`,
		...item,
		share: total > 0 ? (item.count / total) * 100 : 0,
		exception: exceptionFor(item.message),
	}));
}

interface ErrorSummaryInput {
	errorSpans: number;
	spans: number;
	previousErrorSpans?: number;
	previousSpans?: number;
	/** Exceptions recorded on the service in the range. */
	exceptions: number;
	exceptionTypes: number;
}

export interface ErrorSummary {
	errorSpans: number;
	errorRate: number;
	previousErrorSpans?: number;
	previousErrorRate?: number;
	withException: number;
	statusOnly: number;
	exceptionTypes: number;
}

const percentOf = (part: number, whole: number): number =>
	whole > 0 ? (part / whole) * 100 : 0;

export function errorSummary({
	errorSpans,
	spans,
	previousErrorSpans,
	previousSpans,
	exceptions,
	exceptionTypes,
}: ErrorSummaryInput): ErrorSummary {
	const withException = Math.min(exceptions, errorSpans);
	return {
		errorSpans,
		errorRate: percentOf(errorSpans, spans),
		previousErrorSpans,
		previousErrorRate:
			previousErrorSpans === undefined || previousSpans === undefined
				? undefined
				: percentOf(previousErrorSpans, previousSpans),
		withException,
		statusOnly: errorSpans - withException,
		exceptionTypes,
	};
}
