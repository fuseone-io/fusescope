import { QueryParams } from 'constants/query';
import {
	initialQueryBuilderFormValuesMap,
	initialQueryState,
} from 'constants/queryBuilder';
import ROUTES from 'constants/routes';
import { DataSource } from 'types/common/queryBuilder';

interface ExplorerWindow {
	/** Epoch ms. */
	start: number;
	end: number;
}

function explorerUrl(
	path: string,
	source: DataSource.LOGS | DataSource.TRACES,
	expression: string,
	window: ExplorerWindow,
): string {
	const compositeQuery = {
		...initialQueryState,
		queryType: 'builder',
		builder: {
			...initialQueryState.builder,
			queryData: [
				{
					...initialQueryBuilderFormValuesMap[source],
					aggregateOperator: 'noop',
					filter: { expression },
				},
			],
		},
	};
	const search = new URLSearchParams();
	search.set(QueryParams.compositeQuery, JSON.stringify(compositeQuery));
	search.set(QueryParams.startTime, String(window.start));
	search.set(QueryParams.endTime, String(window.end));
	return `${path}?${search.toString()}`;
}

export const logsExplorerUrl = (
	expression: string,
	window: ExplorerWindow,
): string =>
	explorerUrl(ROUTES.LOGS_EXPLORER, DataSource.LOGS, expression, window);

export const tracesExplorerUrl = (
	expression: string,
	window: ExplorerWindow,
): string =>
	explorerUrl(ROUTES.TRACES_EXPLORER, DataSource.TRACES, expression, window);

export function traceDetailUrl(traceId: string, spanId?: string): string {
	const path = ROUTES.TRACE_DETAIL.replace(':id', traceId);
	return spanId ? `${path}?spanId=${spanId}` : path;
}

export const rumApplicationUrl = (applicationId: string): string =>
	ROUTES.RUM_APPLICATION.replace(':id', applicationId);

function withSearch(
	path: string,
	params: Record<string, string | undefined>,
): string {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value) {
			search.set(key, value);
		}
	});
	const query = search.toString();
	return query ? `${path}?${query}` : path;
}

const applicationPath = (path: string, applicationId: string): string =>
	path.replace(':id', applicationId);

export const rumViewsUrl = (applicationId: string, release?: string): string =>
	withSearch(applicationPath(ROUTES.RUM_APPLICATION_VIEWS, applicationId), {
		release,
	});

/** The Views tab with the route's detail sheet open. */
export const rumRouteUrl = (
	applicationId: string,
	route: string,
	release?: string,
): string =>
	withSearch(applicationPath(ROUTES.RUM_APPLICATION_VIEWS, applicationId), {
		release,
		route,
	});

export const rumSessionsUrl = (
	applicationId: string,
	filters: { release?: string; route?: string } = {},
): string =>
	withSearch(applicationPath(ROUTES.RUM_APPLICATION_SESSIONS, applicationId), {
		release: filters.release,
		route: filters.route,
	});

export const rumSessionUrl = (
	applicationId: string,
	sessionId: string,
	release?: string,
): string =>
	withSearch(
		applicationPath(ROUTES.RUM_APPLICATION_SESSION, applicationId).replace(
			':sessionId',
			encodeURIComponent(sessionId),
		),
		{ release },
	);
