import { ViewSort } from './types';

/** Routes asked for, by view count; the API allows up to 500. */
export const ROUTES_LIMIT = 200;

export const ROUTE_PARAM = 'route';

export const DEFAULT_SORT: ViewSort = { key: 'lcp', direction: 'desc' };

export const CHART_VITALS = ['lcp', 'inp', 'cls'] as const;
