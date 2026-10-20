import { StatusTone } from 'components/PageTemplate/types';
import ROUTES from 'constants/routes';
import { routeConfig } from 'container/SideNav/config';
import { getQueryString } from 'container/SideNav/helper';

import { ERROR_RATE_CRITICAL, ERROR_RATE_WARNING } from './constants';

export function errorRateTone(percent: number): StatusTone {
	if (percent >= ERROR_RATE_CRITICAL) {
		return 'error';
	}
	if (percent >= ERROR_RATE_WARNING) {
		return 'warning';
	}
	return 'success';
}

/** p99 in ms: trace data reports ns, span metrics (`signoz_latency`) already ms. */
export function formatP99(value: number, isMetricData: boolean): string {
	if (Number.isNaN(value)) {
		return '0.00';
	}
	return isMetricData ? value.toFixed(2) : (value / 1_000_000).toFixed(2);
}

/** The service page, keeping the params `routeConfig` carries across. */
export function serviceUrl(serviceName: string, search: string): string {
	const queryString = getQueryString(
		routeConfig[ROUTES.SERVICE_METRICS],
		new URLSearchParams(search),
	);
	return `${ROUTES.APPLICATION}/${encodeURIComponent(serviceName)}?${queryString.join('')}`;
}

export function topLevelOperationsUrl(serviceName: string): string {
	return `${ROUTES.APPLICATION}/${encodeURIComponent(serviceName)}/top-level-operations`;
}
