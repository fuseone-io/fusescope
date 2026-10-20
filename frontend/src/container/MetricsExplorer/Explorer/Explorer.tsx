import { useCallback, useEffect, useMemo, useState } from 'react';
import { LOCALSTORAGE } from 'constants/localStorage';
import usePersistedFiltersVisibility from 'components/QuickFilters/hooks/usePersistedFiltersVisibility';
import { useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom-v5-compat';
import * as Sentry from '@sentry/react';
import { Filter, Info } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Switch } from 'components/ui/switch';
import logEvent from 'api/common/logEvent';
import { MetricSelectAddonProvider } from 'components/QueryBuilderV2/QueryV2/MetricsSelect/MetricSelectAddonContext';
import { QueryBuilderV2 } from 'components/QueryBuilderV2/QueryBuilderV2';
import WarningPopover from 'components/WarningPopover/WarningPopover';
import { initialQueriesMap, PANEL_TYPES } from 'constants/queryBuilder';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { usePageActions } from 'container/AIAssistant/pageActions/usePageActions';
import { SavedviewtypesSourceDTO } from 'api/generated/services/fuseScope.schemas';
import QuickFiltersLayout from 'components/QuickFilters/QuickFiltersLayout/QuickFiltersLayout';
import explorerChrome from 'components/ExplorerChrome/ExplorerChrome.module.scss';
import ExplorerOptionWrapper from 'container/ExplorerOptions/ExplorerOptionWrapper';
import RightToolbarActions from 'container/QueryBuilder/components/ToolbarActions/RightToolbarActions';
import { ExportDashboard } from 'hooks/dashboard/useExportDashboards';
import { useGetExportToDashboardLink } from 'hooks/dashboard/useGetExportToDashboardLink';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useShareBuilderUrl } from 'hooks/queryBuilder/useShareBuilderUrl';
import {
	ICurrentQueryData,
	useHandleExplorerTabChange,
} from 'hooks/useHandleExplorerTabChange';
import { useIsAIAssistantEnabled } from 'hooks/useIsAIAssistantEnabled';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { useSavedViewEnabled } from 'hooks/useSavedViewEnabled';
import { isEmpty } from 'lodash-es';
import ErrorBoundaryFallback from 'pages/ErrorBoundaryFallback/ErrorBoundaryFallback';
import {
	metricsAddFilterAction,
	metricsRunQueryAction,
	metricsSaveViewAction,
} from 'pages/MetricsExplorer/aiActions';
import { ExplorerViews } from 'pages/LogsExplorer/utils';
import { Warning } from 'types/api';
import { IBuilderQuery, Query } from 'types/api/queryBuilder/queryBuilderData';
import { MetricAggregation } from 'types/api/v5/queryRange';
import { DataSource } from 'types/common/queryBuilder';
import { explorerViewToPanelType } from 'utils/explorerUtils';
import { v4 as uuid } from 'uuid';

import { MetricsExplorerEventKeys, MetricsExplorerEvents } from '../events';
import MetricDetails from '../MetricDetails/MetricDetails';
import TimeSeries from './TimeSeries';
import {
	getMetricUnits,
	splitQueryIntoOneChartPerQuery,
	useGetMetrics,
} from './utils';

import './Explorer.styles.scss';

const ONE_CHART_PER_QUERY_ENABLED_KEY = 'isOneChartPerQueryEnabled';

function Explorer(): JSX.Element {
	const {
		handleRunQuery,
		stagedQuery,
		updateAllQueriesOperators,
		currentQuery,
		handleSetConfig,
		handleSetQueryData,
		redirectWithQueryBuilderData,
	} = useQueryBuilder();
	const { safeNavigate } = useSafeNavigate();
	const isSavedViewEnabled = useSavedViewEnabled();
	const getExportToDashboardLink = useGetExportToDashboardLink();
	const { handleExplorerTabChange } = useHandleExplorerTabChange();
	const isAIAssistantEnabled = useIsAIAssistantEnabled();
	const [isMetricDetailsOpen, setIsMetricDetailsOpen] = useState(false);
	const [showSidebar, toggleSidebar] = usePersistedFiltersVisibility(
		LOCALSTORAGE.SHOW_METRICS_QUICK_FILTERS,
	);

	const queryClient = useQueryClient();
	const [isLoadingQueries, setIsLoadingQueries] = useState(false);
	const [isCancelled, setIsCancelled] = useState(false);

	useEffect(() => {
		if (isLoadingQueries) {
			setIsCancelled(false);
		}
	}, [isLoadingQueries]);

	const handleCancelQuery = useCallback(() => {
		queryClient.cancelQueries([REACT_QUERY_KEY.GET_QUERY_RANGE]);
		setIsCancelled(true);
	}, [queryClient]);

	const metricNames = useMemo(() => {
		const currentMetricNames: string[] = [];
		stagedQuery?.builder.queryData.forEach((query) => {
			const metricName =
				query.aggregateAttribute?.key ||
				(query.aggregations?.[0] as MetricAggregation | undefined)?.metricName;
			if (metricName) {
				currentMetricNames.push(metricName);
			}
		});
		return currentMetricNames;
	}, [stagedQuery]);

	const {
		metrics,
		isLoading: isMetricUnitsLoading,
		isError: isMetricUnitsError,
	} = useGetMetrics(metricNames);

	const units = useMemo(() => getMetricUnits(metrics), [metrics]);

	const areAllMetricUnitsSame = useMemo(
		() =>
			!isMetricUnitsLoading &&
			!isMetricUnitsError &&
			units.length > 0 &&
			units.every((unit) => unit === units[0]),
		[units, isMetricUnitsLoading, isMetricUnitsError],
	);

	const [searchParams, setSearchParams] = useSearchParams();
	const isOneChartPerQueryEnabled =
		searchParams.get(ONE_CHART_PER_QUERY_ENABLED_KEY) === 'true';

	const [showOneChartPerQuery, toggleShowOneChartPerQuery] = useState(
		isOneChartPerQueryEnabled,
	);
	const [disableOneChartPerQuery, toggleDisableOneChartPerQuery] =
		useState(false);
	const [yAxisUnit, setYAxisUnit] = useState<string | undefined>();

	const unitsLength = useMemo(() => units.length, [units]);
	const firstUnit = useMemo(() => units[0], [units]);

	useEffect(() => {
		// Set the y axis unit to the first metric unit if
		// 1. There is one metric unit and it is not empty
		// 2. All metric units are the same and not empty
		// Else, set the y axis unit to empty if
		// 1. There are more than one metric units and they are not the same
		// 2. There are no metric units
		// 3. There is exactly one metric unit but it is empty/undefined
		if (unitsLength === 0) {
			setYAxisUnit(undefined);
		} else if (unitsLength === 1 && firstUnit) {
			setYAxisUnit(firstUnit);
		} else if (unitsLength === 1 && !firstUnit) {
			setYAxisUnit(undefined);
		} else if (areAllMetricUnitsSame) {
			if (firstUnit) {
				setYAxisUnit(firstUnit);
			} else {
				setYAxisUnit(undefined);
			}
		} else if (unitsLength > 1 && !areAllMetricUnitsSame) {
			setYAxisUnit(undefined);
		}
	}, [unitsLength, firstUnit, areAllMetricUnitsSame]);

	useEffect(() => {
		// Don't apply logic during loading to avoid overwriting user preferences
		if (isMetricUnitsLoading) {
			return;
		}

		// Disable one chart per query if -
		// 1. There are more than one metric
		// 2. The metric units are not the same
		if (units.length > 1 && !areAllMetricUnitsSame) {
			toggleShowOneChartPerQuery(true);
			toggleDisableOneChartPerQuery(true);
		} else if (units.length <= 1) {
			toggleShowOneChartPerQuery(false);
			toggleDisableOneChartPerQuery(true);
		} else {
			// When units are the same and loading is complete, restore URL-based preference
			toggleShowOneChartPerQuery(isOneChartPerQueryEnabled);
			toggleDisableOneChartPerQuery(false);
		}
	}, [
		units,
		areAllMetricUnitsSame,
		isMetricUnitsLoading,
		isOneChartPerQueryEnabled,
	]);

	const handleToggleShowOneChartPerQuery = (): void => {
		toggleShowOneChartPerQuery(!showOneChartPerQuery);
		setSearchParams({
			...Object.fromEntries(searchParams),
			[ONE_CHART_PER_QUERY_ENABLED_KEY]: (!showOneChartPerQuery).toString(),
		});
	};

	const defaultQuery = useMemo(
		() =>
			updateAllQueriesOperators(
				initialQueriesMap[DataSource.METRICS],
				PANEL_TYPES.TIME_SERIES,
				DataSource.METRICS,
			),
		[updateAllQueriesOperators],
	);

	const exportDefaultQuery = useMemo(() => {
		const query = updateAllQueriesOperators(
			currentQuery || initialQueriesMap[DataSource.METRICS],
			PANEL_TYPES.TIME_SERIES,
			DataSource.METRICS,
		);
		if (yAxisUnit && !query.unit) {
			return {
				...query,
				unit: yAxisUnit,
			};
		}
		return query;
	}, [currentQuery, updateAllQueriesOperators, yAxisUnit]);

	useShareBuilderUrl({ defaultValue: defaultQuery });

	const handleChangeSelectedView = useCallback(
		(view: ExplorerViews, querySearchParameters?: ICurrentQueryData): void => {
			const nextPanelType =
				explorerViewToPanelType[view] || PANEL_TYPES.TIME_SERIES;
			handleSetConfig(nextPanelType, DataSource.METRICS);
			handleExplorerTabChange(nextPanelType, querySearchParameters);
		},
		[handleSetConfig, handleExplorerTabChange],
	);

	// ─── AI Assistant page actions (only when license feature is on) ───────────
	const aiActions = useMemo(
		() =>
			isAIAssistantEnabled
				? [
						metricsRunQueryAction({
							currentQuery,
							handleSetQueryData,
							redirectWithQueryBuilderData,
						}),
						metricsAddFilterAction({
							currentQuery,
							handleSetQueryData,
							redirectWithQueryBuilderData,
						}),
						metricsSaveViewAction({
							// POC stub — logs a save request; wire to real API when available
							onSaveView: async (name) => {
								// eslint-disable-next-line no-console
								console.info('[AI Assistant] Save view requested:', name);
							},
						}),
					]
				: [],
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			isAIAssistantEnabled,
			currentQuery,
			handleSetQueryData,
			redirectWithQueryBuilderData,
		],
	);
	usePageActions('metrics-explorer', aiActions);
	// ───────────────────────────────────────────────────────────────────────────

	const handleExport = useCallback(
		(
			dashboard: ExportDashboard | null,
			_isNewDashboard?: boolean,
			queryToExport?: Query,
		): void => {
			if (!dashboard) {
				return;
			}

			const widgetId = uuid();

			let query = queryToExport || exportDefaultQuery;
			if (yAxisUnit && !query.unit) {
				query = {
					...query,
					unit: yAxisUnit,
				};
			}

			const dashboardEditView = getExportToDashboardLink({
				query,
				panelType: PANEL_TYPES.TIME_SERIES,
				dashboardId: dashboard.id,
				widgetId,
			});

			if (dashboardEditView) {
				safeNavigate(dashboardEditView);
			}
		},
		[exportDefaultQuery, safeNavigate, yAxisUnit, getExportToDashboardLink],
	);

	const splitedQueries = useMemo(
		() =>
			splitQueryIntoOneChartPerQuery(
				stagedQuery || initialQueriesMap[DataSource.METRICS],
				metricNames,
				units,
			),
		[stagedQuery, metricNames, units],
	);

	const [selectedMetricName, setSelectedMetricName] = useState<string | null>(
		null,
	);

	const handleOpenMetricDetails = (metricName: string): void => {
		setIsMetricDetailsOpen(true);
		setSelectedMetricName(metricName);
	};

	const metricSelectAddon = useCallback(
		(query: IBuilderQuery): JSX.Element | null => {
			const metricName =
				query.aggregateAttribute?.key ||
				(query.aggregations?.[0] as MetricAggregation | undefined)?.metricName;
			if (!metricName) {
				return null;
			}
			return (
				<span className="fs-ui metric-details-entry">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Metric details for ${metricName}`}
						title="Metric details"
						data-testid="metric-details-entry"
						className="tw:text-muted-foreground"
						onClick={(): void => {
							setSelectedMetricName(metricName);
							setIsMetricDetailsOpen(true);
						}}
					>
						<Info />
					</Button>
				</span>
			);
		},
		[],
	);

	const handleCloseMetricDetails = (): void => {
		setIsMetricDetailsOpen(false);
		setSelectedMetricName(null);
	};

	useEffect(() => {
		logEvent(MetricsExplorerEvents.TabChanged, {
			[MetricsExplorerEventKeys.Tab]: 'explorer',
		});
	}, []);

	const [warning, setWarning] = useState<Warning | undefined>();

	const oneChartPerQueryDisabledTooltip = useMemo(() => {
		if (splitedQueries.length <= 1) {
			return 'One chart per query cannot be toggled for a single query.';
		}
		if (units.length <= 1) {
			return 'One chart per query cannot be toggled when there is only one metric.';
		}
		if (disableOneChartPerQuery) {
			return 'One chart per query cannot be disabled for multiple queries with different units.';
		}
		return;
	}, [disableOneChartPerQuery, splitedQueries.length, units.length]);

	// Show the y axis unit selector if -
	// 1. There is only one metric
	// 2. The metric has no saved unit
	const showYAxisUnitSelector = useMemo(
		() => !isMetricUnitsLoading && units.length === 1 && !units[0],
		[units, isMetricUnitsLoading],
	);

	return (
		<Sentry.ErrorBoundary fallback={<ErrorBoundaryFallback />}>
			<QuickFiltersLayout
				className={explorerChrome.explorerChrome}
				showFilters={showSidebar}
				onToggleFilters={toggleSidebar}
				savedViewProps={{ source: SavedviewtypesSourceDTO.metrics }}
			>
				<div className="metrics-explorer-explore-container">
					<section
						aria-label="Query builder"
						className="metrics-explorer-query-panel"
					>
						<div className="fs-ui metrics-explorer-query-panel__header tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-x-3 tw:gap-y-2 tw:border-b tw:border-border tw:py-2.5 tw:pr-3 tw:pl-4 tw:font-sans">
							<div className="tw:flex tw:items-center tw:gap-2">
								{!showSidebar && (
									<Button
										variant="outline"
										size="icon-sm"
										aria-label="Show Views"
										title="Show Views"
										onClick={toggleSidebar}
										data-testid="metrics-explorer-show-sidebar"
									>
										<Filter />
									</Button>
								)}
								<h2 className="tw:text-sm tw:font-semibold tw:text-foreground">
									Query
								</h2>
							</div>
							<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
								{!isEmpty(warning) && <WarningPopover warningData={warning} />}
								<span
									className="tw:inline-flex tw:items-center tw:gap-2 tw:text-[13px] tw:text-muted-foreground"
									title={oneChartPerQueryDisabledTooltip}
								>
									<Switch
										id="metrics-one-chart-per-query"
										checked={showOneChartPerQuery}
										onCheckedChange={handleToggleShowOneChartPerQuery}
										disabled={disableOneChartPerQuery || splitedQueries.length <= 1}
										aria-disabled={disableOneChartPerQuery || splitedQueries.length <= 1}
										aria-label="One chart per query"
									/>
									<label htmlFor="metrics-one-chart-per-query">1 chart/query</label>
								</span>
								<RightToolbarActions
									onStageRunQuery={(): void => handleRunQuery()}
									isLoadingQueries={isLoadingQueries}
									handleCancelQuery={handleCancelQuery}
								/>
							</div>
						</div>
						<MetricSelectAddonProvider value={metricSelectAddon}>
							<QueryBuilderV2
								config={{
									initialDataSource: DataSource.METRICS,
									queryVariant: 'static',
								}}
								panelType={PANEL_TYPES.TIME_SERIES}
								showFunctions={false}
								version="v3"
							/>
						</MetricSelectAddonProvider>
					</section>
					<div className="explore-content">
						<TimeSeries
							onFetchingStateChange={setIsLoadingQueries}
							showOneChartPerQuery={showOneChartPerQuery}
							setWarning={setWarning}
							areAllMetricUnitsSame={areAllMetricUnitsSame}
							isMetricUnitsLoading={isMetricUnitsLoading}
							isMetricUnitsError={isMetricUnitsError}
							metricUnits={units}
							metricNames={metricNames}
							metrics={metrics}
							handleOpenMetricDetails={handleOpenMetricDetails}
							yAxisUnit={yAxisUnit}
							setYAxisUnit={setYAxisUnit}
							showYAxisUnitSelector={showYAxisUnitSelector}
							isCancelled={isCancelled}
							exportDefaultQuery={exportDefaultQuery}
						/>
					</div>
					{!isSavedViewEnabled && (
						<ExplorerOptionWrapper
							disabled={!stagedQuery}
							query={exportDefaultQuery}
							sourcepage={DataSource.METRICS}
							onExport={handleExport}
							isOneChartPerQuery={showOneChartPerQuery}
							splitedQueries={splitedQueries}
							handleChangeSelectedView={handleChangeSelectedView}
						/>
					)}
				</div>
			</QuickFiltersLayout>
			{isMetricDetailsOpen && selectedMetricName && (
				<MetricDetails
					metricName={selectedMetricName}
					isOpen={isMetricDetailsOpen}
					onClose={handleCloseMetricDetails}
					isModalTimeSelection={false}
				/>
			)}
		</Sentry.ErrorBoundary>
	);
}

export default Explorer;
