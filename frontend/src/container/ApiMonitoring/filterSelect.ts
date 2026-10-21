import { applyCheckboxToggle } from 'components/QuickFilters/FilterRenderers/Checkbox/checkboxFilterQuery';
import { isKeyMatch } from 'components/QuickFilters/FilterRenderers/Checkbox/utils';
import { clearFilterFromQuery } from 'components/QuickFilters/FilterRenderers/shared/filterQuery';
import {
	FiltersType,
	IQuickFiltersConfig,
	QuickFiltersSource,
} from 'components/QuickFilters/types';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

const ACTIVE_QUERY = 0;

const resourceFilter = (key: string): IQuickFiltersConfig => ({
	type: FiltersType.CHECKBOX,
	title: key,
	attributeKey: { key, dataType: DataTypes.String, type: 'resource' },
	dataSource: DataSource.TRACES,
	defaultOpen: false,
});

/** The one value `key` is narrowed to, as the quick filters write it. */
export function selectedFilterValue(
	query: Query,
	key: string,
): string | undefined {
	const items = query.builder.queryData[ACTIVE_QUERY]?.filters?.items ?? [];
	const item = items.find((candidate) => isKeyMatch(candidate.key?.key, key));
	if (!item) {
		return undefined;
	}
	const op = String(item.op).toLowerCase();
	if (op === '=' && typeof item.value === 'string') {
		return item.value;
	}
	if (op === 'in') {
		const values = Array.isArray(item.value) ? item.value : [item.value];
		return values.length === 1 ? String(values[0]) : undefined;
	}
	return undefined;
}

/** Narrows `key` to `value`, or drops the key when `value` is undefined. */
export function withFilterValue(
	query: Query,
	key: string,
	value: string | undefined,
): Query {
	const cleared = clearFilterFromQuery({
		currentQuery: query,
		filterKey: key,
		activeQueryIndex: ACTIVE_QUERY,
	});
	if (value === undefined) {
		return cleared;
	}
	return applyCheckboxToggle({
		currentQuery: cleared,
		activeQueryIndex: ACTIVE_QUERY,
		filter: resourceFilter(key),
		source: QuickFiltersSource.API_MONITORING,
		attributeValues: [value],
		value,
		checked: true,
		isOnlyOrAllClicked: true,
	});
}
