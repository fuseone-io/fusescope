import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';

import { VIEWS } from './Explorer/Domains/DomainDetails/constants';
import { ApiMonitoringParams, getApiMonitoringParams } from './queryParams';

export enum DomainTab {
	Overview = 'overview',
	Endpoints = 'endpoints',
	Errors = 'errors',
}

const PARAM_KEY = 'apiMonitoringParams';

/** Params that only meant something to the drawer. */
const DRAWER_ONLY_PARAMS: (keyof ApiMonitoringParams)[] = [
	'selectedDomain',
	'modalTimeRange',
	'selectedInterval',
];

export function domainPath(domain: string, search = ''): string {
	const path = ROUTES.API_MONITORING_DOMAIN.replace(
		':domain',
		encodeURIComponent(domain),
	);
	return `${path}${search}`;
}

export function readDomainParam(raw: string): string {
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

export function domainTabOfView(view: string | undefined): DomainTab {
	if (view === VIEWS.ALL_ENDPOINTS) {
		return DomainTab.Endpoints;
	}
	if (view === VIEWS.TOP_ERRORS) {
		return DomainTab.Errors;
	}
	return DomainTab.Overview;
}

export function viewOfTab(tab: DomainTab): VIEWS {
	if (tab === DomainTab.Endpoints) {
		return VIEWS.ALL_ENDPOINTS;
	}
	if (tab === DomainTab.Errors) {
		return VIEWS.TOP_ERRORS;
	}
	return VIEWS.ENDPOINT_STATS;
}

/** The tab a domain page URL opens; Overview unless the URL names another. */
export function domainTabOfSearch(search: string): DomainTab {
	if (!new URLSearchParams(search).has(PARAM_KEY)) {
		return DomainTab.Overview;
	}
	return domainTabOfView(getApiMonitoringParams(search).selectedView);
}

/**
 * The search a list URL hands a domain page: the list's query, time and IP
 * setting, with every domain-specific param reset to the Overview.
 */
export function domainSearch(listSearch: string): string {
	const urlParams = new URLSearchParams(listSearch);
	const { showIP } = getApiMonitoringParams(listSearch);
	const params: ApiMonitoringParams = {
		...(showIP === undefined ? {} : { showIP }),
		selectedView: VIEWS.ENDPOINT_STATS,
	};
	urlParams.set(PARAM_KEY, encodeURIComponent(JSON.stringify(params)));
	return `?${urlParams.toString()}`;
}

/**
 * The domain page for a list URL that opened the old domain drawer, or null.
 * The drawer's own time range (seconds) becomes the global one (milliseconds).
 */
export function legacyDomainRedirect(search: string): string | null {
	const params = getApiMonitoringParams(search);
	if (!params.selectedDomain) {
		return null;
	}

	const urlParams = new URLSearchParams(search);
	const rest: ApiMonitoringParams = { ...params };
	DRAWER_ONLY_PARAMS.forEach((key) => delete rest[key]);
	urlParams.set(PARAM_KEY, encodeURIComponent(JSON.stringify(rest)));

	const range = params.modalTimeRange;
	if (range?.startTime && range?.endTime) {
		urlParams.delete(QueryParams.relativeTime);
		urlParams.set(QueryParams.startTime, String(range.startTime * 1000));
		urlParams.set(QueryParams.endTime, String(range.endTime * 1000));
	}

	return domainPath(params.selectedDomain, `?${urlParams.toString()}`);
}
