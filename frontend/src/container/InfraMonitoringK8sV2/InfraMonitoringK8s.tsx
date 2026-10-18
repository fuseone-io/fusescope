import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import QuickFilters from 'components/QuickFilters/QuickFilters';
import {
	QuickFilterChangeEventData,
	QuickFilterCheckboxUseFieldApis,
	QuickFiltersSource,
} from 'components/QuickFilters/types';
import { initialQueriesMap } from 'constants/queryBuilder';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import ErrorBoundaryFallback from 'pages/ErrorBoundaryFallback/ErrorBoundaryFallback';
import { DataSource } from 'types/common/queryBuilder';

import { CategoryIcon } from './Base/categoryIcons';
import { K8sDynamicList } from './Base/K8sDynamicList';
import EntityStatusFilter from './Base/components/EntityStatusFilter/EntityStatusFilter';
import {
	GetClustersQuickFiltersConfig,
	GetContainersQuickFiltersConfig,
	GetDaemonsetsQuickFiltersConfig,
	GetDeploymentsQuickFiltersConfig,
	GetJobsQuickFiltersConfig,
	GetNamespaceQuickFiltersConfig,
	GetNodesQuickFiltersConfig,
	GetPodsQuickFiltersConfig,
	GetStatefulsetsQuickFiltersConfig,
	GetVolumesQuickFiltersConfig,
	InfraMonitoringEntity,
	K8S_CATEGORY_LABELS,
	K8sCategories,
	METRIC_NAMESPACE_BY_ENTITY,
} from './constants';
import {
	useInfraMonitoringCategory,
	useInfraMonitoringContainerStatusFilter,
	useInfraMonitoringGroupBy,
	useInfraMonitoringNodeReadinessFilter,
	useInfraMonitoringOrderBy,
	useInfraMonitoringPageListing,
	useInfraMonitoringPodStatusFilter,
	useInfraMonitoringSelectedItemParams,
} from './hooks';

import InfraFilterRail from './components/InfraFilterRail';
import InfraListLayout from './components/InfraListLayout';
import K8sCategoryList from './components/K8sCategoryList';
import RailSectionLabel from './components/RailSectionLabel';
import RailToggleButton from 'components/PageTemplate/components/RailToggleButton';
import { InfraMonitoringEvents } from 'constants/events';
import logEvent from 'api/common/logEvent';
import { NANO_SECOND_MULTIPLIER, useGlobalTimeStore } from 'store/globalTime';
import {
	logInfraFilterCustomizedEvent,
	logInfraMonitoringListViewedEvent,
} from 'container/InfraMonitoringK8sV2/Base/events';

export default function InfraMonitoringK8s(): JSX.Element {
	const [showFilters, setShowFilters] = useState(true);

	const [selectedCategory, setSelectedCategory] = useInfraMonitoringCategory();
	const [, setGroupBy] = useInfraMonitoringGroupBy();
	const [, setOrderBy] = useInfraMonitoringOrderBy();
	const [, setSelectedItemParams] = useInfraMonitoringSelectedItemParams();
	const [, setCurrentPage] = useInfraMonitoringPageListing();
	const [, setPodStatusFilter] = useInfraMonitoringPodStatusFilter();
	const [, setNodeReadinessFilter] = useInfraMonitoringNodeReadinessFilter();
	const [, setContainerStatusFilter] = useInfraMonitoringContainerStatusFilter();

	const compositeQuery = useGetCompositeQueryParam();
	const { currentQuery, redirectWithQueryBuilderData } = useQueryBuilder();
	const isInitialized = useRef(false);

	const selectedTime = useGlobalTimeStore((state) => state.selectedTime);
	const getMinMaxTime = useGlobalTimeStore((state) => state.getMinMaxTime);
	const { startUnixMilli, endUnixMilli } = useMemo(() => {
		const { minTime, maxTime } = getMinMaxTime();
		return {
			startUnixMilli: Math.floor(minTime / NANO_SECOND_MULTIPLIER),
			endUnixMilli: Math.floor(maxTime / NANO_SECOND_MULTIPLIER),
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedTime, getMinMaxTime]);

	const getUseFieldApis = useCallback(
		(entity: InfraMonitoringEntity): QuickFilterCheckboxUseFieldApis => ({
			metricNamespace: METRIC_NAMESPACE_BY_ENTITY[entity],
			startUnixMilli,
			endUnixMilli,
		}),
		[startUnixMilli, endUnixMilli],
	);

	const selectedCategoryUseFieldApis = useMemo(
		() => getUseFieldApis(selectedCategory as InfraMonitoringEntity),
		[getUseFieldApis, selectedCategory],
	);

	useEffect(() => {
		if (isInitialized.current) {
			return;
		}
		isInitialized.current = true;

		if (!compositeQuery) {
			const defaultQuery = initialQueriesMap[DataSource.METRICS];
			redirectWithQueryBuilderData({
				...defaultQuery,
				builder: {
					...defaultQuery.builder,
					queryData: defaultQuery.builder.queryData.map((query) => ({
						...query,
						filter: { expression: '' },
						filters: { items: [], op: 'AND' as const },
					})),
				},
			});
		}
	}, [compositeQuery, redirectWithQueryBuilderData]);

	useEffect(() => {
		void logEvent(InfraMonitoringEvents.FilterApplied, {
			entity: InfraMonitoringEvents.K8sEntity,
			page: InfraMonitoringEvents.ListPage,
			category: selectedCategory,
			view: InfraMonitoringEvents.QuickFiltersView,
		});

		// The category query param is a plain string; entities are validated by
		// getEntityConfig before rendering
		logInfraMonitoringListViewedEvent(selectedCategory as InfraMonitoringEntity);
	}, [selectedCategory]);

	const handleFilterVisibilityChange = useCallback((): void => {
		setShowFilters((show) => !show);
	}, []);

	const handleQuickFilterChange = useCallback(
		(data: QuickFilterChangeEventData): void => {
			logInfraFilterCustomizedEvent(
				selectedCategory as InfraMonitoringEntity,
				'quick_filter',
				data.expression,
				data.filterItemKeys,
			);
		},
		[selectedCategory],
	);

	const categories = useMemo(
		() => [
			{
				key: K8sCategories.CONTAINERS,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.CONTAINERS],
				icon: <CategoryIcon category={InfraMonitoringEntity.CONTAINERS} />,
				config: GetContainersQuickFiltersConfig(),
			},
			{
				key: K8sCategories.PODS,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.PODS],
				icon: <CategoryIcon category={InfraMonitoringEntity.PODS} />,
				config: GetPodsQuickFiltersConfig(),
			},
			{
				key: K8sCategories.NODES,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.NODES],
				icon: <CategoryIcon category={InfraMonitoringEntity.NODES} />,
				config: GetNodesQuickFiltersConfig(),
			},
			{
				key: K8sCategories.NAMESPACES,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.NAMESPACES],
				icon: <CategoryIcon category={InfraMonitoringEntity.NAMESPACES} />,
				config: GetNamespaceQuickFiltersConfig(),
			},
			{
				key: K8sCategories.CLUSTERS,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.CLUSTERS],
				icon: <CategoryIcon category={InfraMonitoringEntity.CLUSTERS} />,
				config: GetClustersQuickFiltersConfig(),
			},
			{
				key: K8sCategories.DEPLOYMENTS,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.DEPLOYMENTS],
				icon: <CategoryIcon category={InfraMonitoringEntity.DEPLOYMENTS} />,
				config: GetDeploymentsQuickFiltersConfig(),
			},
			{
				key: K8sCategories.JOBS,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.JOBS],
				icon: <CategoryIcon category={InfraMonitoringEntity.JOBS} />,
				config: GetJobsQuickFiltersConfig(),
			},
			{
				key: K8sCategories.DAEMONSETS,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.DAEMONSETS],
				icon: <CategoryIcon category={InfraMonitoringEntity.DAEMONSETS} />,
				config: GetDaemonsetsQuickFiltersConfig(),
			},
			{
				key: K8sCategories.STATEFULSETS,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.STATEFULSETS],
				icon: <CategoryIcon category={InfraMonitoringEntity.STATEFULSETS} />,
				config: GetStatefulsetsQuickFiltersConfig(),
			},
			{
				key: K8sCategories.VOLUMES,
				label: K8S_CATEGORY_LABELS[InfraMonitoringEntity.VOLUMES],
				icon: <CategoryIcon category={InfraMonitoringEntity.VOLUMES} />,
				config: GetVolumesQuickFiltersConfig(),
			},
		],
		[],
	);

	const selectedCategoryConfig = useMemo(
		() => categories.find((cat) => cat.key === selectedCategory)?.config,
		[categories, selectedCategory],
	);

	const handleCategorySelect = (key: string): void => {
		if (key !== selectedCategory) {
			void setSelectedCategory(key as string);
			void setOrderBy(null);
			void setGroupBy(null);
			void setCurrentPage(null);
			setSelectedItemParams(null);
			void setPodStatusFilter(null);
			void setNodeReadinessFilter(null);
			void setContainerStatusFilter(null);
			redirectWithQueryBuilderData({
				...currentQuery,
				builder: {
					...currentQuery.builder,
					queryData: [
						{
							...(currentQuery.builder.queryData[0] || {}),
							filter: { expression: '' },
							filters: { items: [], op: 'AND' as const },
						},
					],
				},
			});
		}
	};

	const openFiltersButton = showFilters ? undefined : (
		<RailToggleButton
			open={false}
			openLabel="Open Filters"
			onToggle={handleFilterVisibilityChange}
		/>
	);

	return (
		<Sentry.ErrorBoundary fallback={<ErrorBoundaryFallback />}>
			<InfraListLayout
				rail={
					showFilters && (
						<InfraFilterRail>
							<div className="tw:flex tw:flex-col tw:gap-0.5 tw:border-b tw:border-border tw:p-3">
								<RailSectionLabel
									className="tw:px-2"
									action={
										<RailToggleButton open onToggle={handleFilterVisibilityChange} />
									}
								>
									Resource
								</RailSectionLabel>
								<K8sCategoryList
									categories={categories}
									selected={selectedCategory}
									onSelect={handleCategorySelect}
								/>
							</div>
							<RailSectionLabel className="tw:px-5 tw:pt-3">
								Filter by
							</RailSectionLabel>
							{selectedCategoryConfig && (
								<QuickFilters
									source={QuickFiltersSource.INFRA_MONITORING}
									config={selectedCategoryConfig}
									handleFilterVisibilityChange={handleFilterVisibilityChange}
									useFieldApis={selectedCategoryUseFieldApis}
									onQuickFilterChange={handleQuickFilterChange}
								/>
							)}
						</InfraFilterRail>
					)
				}
			>
				<K8sDynamicList
					controlListPrefix={openFiltersButton}
					leftFilters={<EntityStatusFilter />}
				/>
			</InfraListLayout>
		</Sentry.ErrorBoundary>
	);
}
