import { ViewSort } from './types';

/** Routes asked for, by view count; the API allows up to 500. */
export const ROUTES_LIMIT = 200;

export const ROUTE_PARAM = 'route';

export const DEFAULT_SORT: ViewSort = { key: 'lcp', direction: 'desc' };

export const CHART_VITALS = ['lcp', 'inp', 'cls'] as const;

/** Columns that give way, in this order, when the routes table is narrow; the route sheet shows both. */
export const HIDDEN_BELOW_75REM = 'tw:@max-[75rem]/routes:hidden';
export const HIDDEN_BELOW_70REM = 'tw:@max-[70rem]/routes:hidden';
