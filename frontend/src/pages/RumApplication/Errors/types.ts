import { ERROR_SOURCES } from './constants';

export type ErrorSource = (typeof ERROR_SOURCES)[number];

export interface ErrorFilters {
	search: string;
	/** Empty for every source. */
	source: ErrorSource | '';
	route: string;
}
