import { IQuickFiltersConfig, QuickFiltersSource } from '../../types';
import { SEVERITY_FILTER_KEY } from './severityFilterQuery';

/** Only the logs explorer groups severity_text into levels; every other facet is unchanged. */
export function isLogsSeverityFilter(
	source: QuickFiltersSource,
	filter: IQuickFiltersConfig,
): boolean {
	return (
		source === QuickFiltersSource.LOGS_EXPLORER &&
		filter.attributeKey.key === SEVERITY_FILTER_KEY
	);
}
