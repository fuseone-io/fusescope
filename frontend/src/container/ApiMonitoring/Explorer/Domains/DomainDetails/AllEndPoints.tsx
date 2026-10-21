import { useCallback, useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import { initialQueriesMap } from 'constants/queryBuilder';
import {
	getAllEndpointsWidgetData,
	getGroupByFiltersFromGroupByValues,
} from 'container/ApiMonitoring/utils';
import QueryBuilderSearchV2 from 'container/QueryBuilder/filters/QueryBuilderSearchV2/QueryBuilderSearchV2';
import { useGetAggregateKeys } from 'hooks/queryBuilder/useGetAggregateKeys';
import { isEqual } from 'lodash-es';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import { useApiMonitoringParams } from '../../../queryParams';
import EndpointsTable from './components/EndpointsTable';
import { SPAN_ATTRIBUTES, VIEWS } from './constants';

function AllEndPoints({
	domainName,
	setSelectedEndPointName,
	setSelectedView,
	groupBy,
	setGroupBy,
	timeRange,
	initialFilters,
	setInitialFiltersEndPointStats,
}: {
	domainName: string;
	setSelectedEndPointName: (name: string) => void;
	setSelectedView: (tab: VIEWS) => void;
	groupBy: IBuilderQuery['groupBy'];
	setGroupBy: (groupBy: IBuilderQuery['groupBy']) => void;
	timeRange: {
		startTime: number;
		endTime: number;
	};
	initialFilters: IBuilderQuery['filters'];
	setInitialFiltersEndPointStats: (filters: IBuilderQuery['filters']) => void;
}): JSX.Element {
	const [params, setParams] = useApiMonitoringParams();
	const [groupBySearchValue, setGroupBySearchValue] = useState<string>('');
	const [allAvailableGroupByOptions, setAllAvailableGroupByOptions] = useState<{
		[key: string]: any;
	}>({});

	const { data: groupByFiltersData, isLoading: isLoadingGroupByFilters } =
		useGetAggregateKeys({
			dataSource: DataSource.TRACES,
			aggregateAttribute: '',
			aggregateOperator: 'noop',
			searchText: groupBySearchValue,
			tagType: '',
		});

	const [groupByOptions, setGroupByOptions] = useState<
		{ value: string; label: string }[]
	>([]);

	// --- FILTERS STATE SYNC ---
	const [filters, setFilters] = useState<IBuilderQuery['filters']>(() => {
		if (params.allEndpointsLocalFilters) {
			return params.allEndpointsLocalFilters;
		}
		// Initialize filters based on the initial endPointName prop
		const initialItems = [...(initialFilters?.items || [])];
		return { op: 'AND', items: initialItems };
	});

	// Sync params to local filters state on param change
	useEffect(() => {
		if (
			params.allEndpointsLocalFilters &&
			!isEqual(params.allEndpointsLocalFilters, filters)
		) {
			setFilters(params.allEndpointsLocalFilters);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [params.allEndpointsLocalFilters]);

	// Handler for changes from the QueryBuilderSearchV2 component
	const handleFilterChange = useCallback(
		(newFilters: IBuilderQuery['filters']): void => {
			setFilters(newFilters);
			setParams({ allEndpointsLocalFilters: newFilters });
		},
		[setParams],
	);

	const currentQuery = initialQueriesMap[DataSource.TRACES];

	const updatedCurrentQuery = useMemo(
		() => ({
			...currentQuery,
			builder: {
				...currentQuery.builder,
				queryData: [
					{
						...currentQuery.builder.queryData[0],
						dataSource: DataSource.TRACES,
						filters, // Use the local filters state
					},
				],
			},
		}),
		[filters, currentQuery],
	);

	const query = updatedCurrentQuery?.builder?.queryData[0] || null;

	const allEndpointsWidgetData = useMemo(
		() => getAllEndpointsWidgetData(groupBy, domainName, filters),
		[groupBy, domainName, filters],
	);

	// --- GROUP BY STATE SYNC (existing) ---
	const handleGroupByChange = useCallback(
		(value: IBuilderQuery['groupBy']) => {
			const newGroupBy = [];

			for (let index = 0; index < value.length; index++) {
				const element = value[index] as unknown as string;

				// Check if the key exists in our cached options first
				if (allAvailableGroupByOptions[element]) {
					newGroupBy.push(allAvailableGroupByOptions[element]);
				} else {
					// If not found in cache, check the current filtered results
					const key = groupByFiltersData?.payload?.attributeKeys?.find(
						(key) => key.key === element,
					);

					if (key) {
						newGroupBy.push(key);
					}
				}
			}

			setGroupBy(newGroupBy);
			setGroupBySearchValue('');
			// Update params
			setParams({ groupBy: newGroupBy.map((g) => g.key) });
		},
		[groupByFiltersData, setGroupBy, allAvailableGroupByOptions, setParams],
	);

	// Sync params to local groupBy state on param change
	useEffect(() => {
		if (
			params.groupBy &&
			Array.isArray(params.groupBy) &&
			!isEqual(
				params.groupBy,
				groupBy.map((g) => g.key),
			)
		) {
			// Only update if different
			const newGroupBy = params.groupBy
				.map((key) => allAvailableGroupByOptions[key])
				.filter(Boolean);
			if (newGroupBy.length === params.groupBy.length) {
				setGroupBy(newGroupBy);
			}
		}
	}, [params.groupBy, allAvailableGroupByOptions, groupBy, setGroupBy]);

	useEffect(() => {
		if (groupByFiltersData?.payload) {
			// Update dropdown options
			setGroupByOptions(
				groupByFiltersData?.payload?.attributeKeys?.map((filter) => ({
					value: filter.key,
					label: filter.key,
				})) || [],
			);

			// Cache all available options to preserve selected values using functional update
			setAllAvailableGroupByOptions((prevOptions) => {
				const newOptions = { ...prevOptions };
				groupByFiltersData?.payload?.attributeKeys?.forEach((filter) => {
					newOptions[filter.key] = filter;
				});
				return newOptions;
			});
		}
	}, [groupByFiltersData]); // Only depends on groupByFiltersData now

	// Cache existing selected options on component mount
	useEffect(() => {
		if (groupBy && groupBy.length > 0) {
			setAllAvailableGroupByOptions((prevOptions) => {
				const newOptions = { ...prevOptions };
				groupBy.forEach((option) => {
					newOptions[option.key] = option;
				});
				return newOptions;
			});
		}
	}, [groupBy]);

	const onRowClick = useCallback(
		(props: any): void => {
			setSelectedEndPointName(props[SPAN_ATTRIBUTES.HTTP_URL] as string);
			setSelectedView(VIEWS.ENDPOINT_STATS);
			const initialItems = [
				...(filters?.items || []),
				...(getGroupByFiltersFromGroupByValues(props, groupBy)?.items || []),
			];
			setInitialFiltersEndPointStats({
				items: initialItems,
				op: 'AND',
			});
			setParams({
				selectedEndPointName: props[SPAN_ATTRIBUTES.HTTP_URL] as string,
				selectedView: VIEWS.ENDPOINT_STATS,
				endPointDetailsLocalFilters: {
					items: initialItems,
					op: 'AND',
				},
			});
		},
		[
			filters,
			setInitialFiltersEndPointStats,
			setSelectedEndPointName,
			setSelectedView,
			groupBy,
			setParams,
		],
	);

	return (
		<div className="all-endpoints-container tw:flex tw:flex-col tw:gap-4">
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2">
				<div className="filter-container tw:min-w-0 tw:flex-[1_1_360px]">
					<QueryBuilderSearchV2
						query={query}
						onChange={handleFilterChange}
						placeholder="Filter, e.g. http.request.method = 'POST'"
					/>
				</div>
				<div className="group-by-container fs-ui tw:flex tw:h-9 tw:min-w-0 tw:flex-[0_1_340px] tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-input tw:bg-surface-raised tw:pl-3 tw:font-sans">
					<span className="group-by-label tw:text-xs tw:whitespace-nowrap tw:text-subtle-foreground">
						Group by
					</span>
					<Select
						className="group-by-select tw:min-w-0 tw:flex-1"
						bordered={false}
						loading={isLoadingGroupByFilters}
						mode="multiple"
						value={groupBy}
						allowClear
						maxTagCount="responsive"
						placeholder="Search for attribute"
						options={groupByOptions}
						onChange={handleGroupByChange}
						onSearch={(value: string): void => setGroupBySearchValue(value)}
					/>
				</div>
			</div>
			<EndpointsTable
				widget={allEndpointsWidgetData}
				timeRange={timeRange}
				onRowClick={onRowClick}
			/>
		</div>
	);
}

export default AllEndPoints;
