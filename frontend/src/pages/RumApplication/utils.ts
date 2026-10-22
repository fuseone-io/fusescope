import { allOf, inList, quote } from 'lib/apm/filters';
import { exceptionEventsFilter, RUM_ATTRIBUTES } from 'lib/rum/attributes';
import { ErrorGroup } from 'lib/rum/overviewTypes';

/** The application's exceptions in the logs explorer, or one error group's. */
export function errorLogsFilter(filter: string, error?: ErrorGroup): string {
	if (!error) {
		return allOf(filter, exceptionEventsFilter);
	}
	return allOf(
		filter,
		exceptionEventsFilter,
		`${RUM_ATTRIBUTES.exceptionType} = ${quote(error.type)}`,
		error.message
			? `${RUM_ATTRIBUTES.exceptionMessage} = ${quote(error.message)}`
			: '',
	);
}

export const sessionsTracesFilter = (
	filter: string,
	sessionIds: string[],
): string =>
	allOf(filter, `${RUM_ATTRIBUTES.sessionId} IN ${inList(sessionIds)}`);

/** "7f3ac9…c21e". */
export const shortSessionId = (id: string): string =>
	id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
