import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import { toast } from '@signozhq/ui/sonner';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import { ArrowLeft, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import logEvent from 'api/common/logEvent';
import ErrorContent from 'components/ErrorModal/components/ErrorContent';
import APIError from 'types/api/error';
import { InfraMonitoringEvents } from 'constants/events';
import {
	GlobalTimeProvider,
	NANO_SECOND_MULTIPLIER,
	useGlobalTimeStore,
} from 'store/globalTime';

import {
	INFRA_MONITORING_K8S_PARAMS_KEYS,
	K8S_CATEGORY_SINGULAR_LABELS,
} from '../constants';
import { useInfraMonitoringSelectedItemParams } from '../hooks';
import CopyButton from 'periscope/components/CopyButton/CopyButton';
import LoadingContainer from '../LoadingContainer';

import EntityDetailSheet from './components/EntityDetailSheet';
import K8sBaseDetailsContent from './K8sBaseDetailsContent';
import { CategoryIcon } from './categoryIcons';
import { getEntityNameAttributeKey } from './relations';
import { useDrawerHistoryStore } from './useDrawerHistoryStore';
import { usePrimeEntityDetails } from './usePrimeEntityDetails';
import { K8sBaseDetailsProps } from './types';
import { useDrawerLifecycleStore } from './useDrawerLifecycleStore';

import { INFRA_MONITORING_DETAILS_CACHE_TIME } from 'constants/queryCacheTime';

export type {
	CustomTab,
	CustomTabRenderProps,
	K8sBaseDetailsProps,
	K8sDetailsCountConfig,
	K8sDetailsFilters,
	K8sDetailsMetadataConfig,
} from './types';

export default function K8sBaseDetails<T>({
	category,
	eventCategory,
	getSelectedItemExpression,
	fetchEntityData,
	getEntityName,
	getInitialLogTracesExpression,
	getInitialEventsExpression,
	metadataConfig,
	countsConfig,
	getCountsFilterExpression,
	entityWidgetInfo,
	getEntityQueryPayload,
	queryKeyPrefix,
	hideDetailViewTabs = false,
	tabsConfig,
	customTabs,
	getStatus,
}: K8sBaseDetailsProps<T>): JSX.Element {
	const selectedTime = useGlobalTimeStore((s) => s.selectedTime);
	const getMinMaxTime = useGlobalTimeStore((s) => s.getMinMaxTime);
	const getAutoRefreshQueryKey = useGlobalTimeStore(
		(s) => s.getAutoRefreshQueryKey,
	);

	const [selectedItemParams, setSelectedItemParams] =
		useInfraMonitoringSelectedItemParams();
	const selectedItem = selectedItemParams.selectedItem;

	const selectedItemExpression = useMemo(
		() => getSelectedItemExpression(selectedItemParams),
		[getSelectedItemExpression, selectedItemParams],
	);

	const entityQueryKey = useMemo(
		() =>
			getAutoRefreshQueryKey(
				selectedTime,
				`${queryKeyPrefix}EntityDetails`,
				selectedItem,
				selectedItemParams.clusterName,
				selectedItemParams.namespaceName,
				selectedItemParams.containerName,
			),
		[
			queryKeyPrefix,
			selectedItem,
			selectedItemParams.clusterName,
			selectedItemParams.namespaceName,
			selectedItemParams.containerName,
			selectedTime,
			getAutoRefreshQueryKey,
		],
	);

	const {
		data: entityResponse,
		isLoading: isEntityLoading,
		isError: isEntityError,
		error: entityError,
	} = useQuery({
		queryKey: entityQueryKey,
		queryFn: ({ signal }) => {
			if (!selectedItem) {
				return { data: null };
			}
			const { minTime, maxTime } = getMinMaxTime();
			const start = Math.floor(minTime / NANO_SECOND_MULTIPLIER);
			const end = Math.floor(maxTime / NANO_SECOND_MULTIPLIER);
			return fetchEntityData(
				{ filter: { expression: selectedItemExpression }, start, end },
				signal,
			);
		},
		cacheTime: INFRA_MONITORING_DETAILS_CACHE_TIME,
		staleTime: INFRA_MONITORING_DETAILS_CACHE_TIME,
		enabled: !!selectedItem,
	});

	const entity = entityResponse?.data ?? null;
	const hasResponseError = !!entityResponse?.error;

	const logsAndTracesInitialExpression = useMemo(() => {
		if (!entity) {
			return '';
		}
		return getInitialLogTracesExpression(entity);
	}, [entity, getInitialLogTracesExpression]);

	const eventsInitialExpression = useMemo(() => {
		if (!entity) {
			return '';
		}
		return getInitialEventsExpression(entity);
	}, [entity, getInitialEventsExpression]);

	const markDrawerOpened = useDrawerLifecycleStore((s) => s.markOpened);
	const markDrawerClosed = useDrawerLifecycleStore((s) => s.markClosed);

	useEffect(() => {
		if (selectedItem) {
			markDrawerOpened();
		} else {
			markDrawerClosed();
		}
	}, [selectedItem, markDrawerOpened, markDrawerClosed]);

	const previousEntry = useDrawerHistoryStore(
		(store) => store.entries[store.entries.length - 1] ?? null,
	);
	const popDrawerHistory = useDrawerHistoryStore((store) => store.pop);
	const primeDetails = usePrimeEntityDetails();
	const resetHistory = useDrawerHistoryStore((store) => store.reset);

	const handleClose = useCallback((): void => {
		resetHistory();
		setSelectedItemParams(null);
	}, [resetHistory, setSelectedItemParams]);

	// Steps back through resources opened from an overview tab
	const handleBack = useCallback((): void => {
		const previous = popDrawerHistory();

		if (!previous) {
			return;
		}

		primeDetails(previous);
		setSelectedItemParams(previous.params);
	}, [popDrawerHistory, primeDetails, setSelectedItemParams]);

	const handleOpenChange = useCallback(
		(open: boolean): void => {
			if (!open) {
				handleClose();
			}
		},
		[handleClose],
	);

	const handleCopyId = useCallback((): void => {
		toast.success(
			`${K8S_CATEGORY_SINGULAR_LABELS[category]} name copied to clipboard`,
			{ position: 'bottom-left' },
		);
	}, [category]);

	const entityName = entity ? getEntityName(entity) : '';

	// meta carries the resource's parents; its own name comes from the config
	const entityAttributes = useMemo((): Record<string, string> => {
		const meta = (entity as { meta?: Record<string, string> | null } | null)
			?.meta;

		return {
			...(meta ?? {}),
			...(entityName ? { [getEntityNameAttributeKey(category)]: entityName } : {}),
		};
	}, [entity, entityName, category]);

	useEffect(() => {
		if (entity) {
			void logEvent(InfraMonitoringEvents.PageVisited, {
				entity: InfraMonitoringEvents.K8sEntity,
				page: InfraMonitoringEvents.DetailedPage,
				category: eventCategory,
			});
		}
	}, [entity, eventCategory]);

	// Names the resource it returns to, so a drill several levels deep stays clear
	const backTarget = previousEntry
		? `Back to ${K8S_CATEGORY_SINGULAR_LABELS[previousEntry.category]}`
		: '';
	const backLabel = previousEntry ? `${backTarget}: ${previousEntry.label}` : '';

	const status = entity && getStatus ? getStatus(entity) : null;

	const header = (
		<div className="fs-ui tw:flex tw:flex-none tw:items-center tw:gap-3 tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3 tw:font-sans">
			{/* One control: step back where there is a trail, close otherwise.
			    Clicking outside the drawer closes it either way. The label is text
			    rather than a tooltip, which a click on the control would dismiss. */}
			{previousEntry ? (
				<Button
					variant="ghost"
					size="sm"
					onClick={handleBack}
					data-testid="drawer-back-button"
					aria-label={backLabel}
					className="tw:text-muted-foreground"
				>
					<ArrowLeft />
					{backTarget}
				</Button>
			) : (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close"
					onClick={handleClose}
					data-testid="close-drawer-button"
					className="tw:text-muted-foreground"
				>
					<X />
				</Button>
			)}
			<span aria-hidden="true" className="tw:h-5 tw:w-px tw:bg-border" />
			<span
				className="tw:inline-flex tw:h-6 tw:flex-none tw:items-center tw:gap-1.5 tw:rounded-md tw:bg-primary-soft tw:px-2 tw:text-[11px] tw:font-medium tw:tracking-[0.06em] tw:text-primary-ink tw:uppercase"
				data-testid="drawer-entity-kind"
			>
				<CategoryIcon category={category} />
				{K8S_CATEGORY_SINGULAR_LABELS[category]}
			</span>
			<DialogPrimitive.Title className="tw:min-w-0 tw:truncate tw:font-mono tw:text-base tw:font-medium tw:text-foreground">
				{entityName ||
					((isEntityError || hasResponseError) && 'Failed to load entity details') ||
					(isEntityLoading && 'Loading...') ||
					'-'}
			</DialogPrimitive.Title>
			<CopyButton
				value={entityName || selectedItem || ''}
				ariaLabel={`Copy ${K8S_CATEGORY_SINGULAR_LABELS[category]} name`}
				testId="copy-id-button"
				onCopy={handleCopyId}
			/>
			{status && (
				<StatusBadge tone={status.tone} dot testId="drawer-entity-status">
					{status.label}
				</StatusBadge>
			)}
		</div>
	);

	return (
		<EntityDetailSheet
			open={!!selectedItem}
			onOpenChange={handleOpenChange}
			header={header}
		>
			{(isEntityLoading || !selectedItem) && <LoadingContainer />}

			{selectedItem && (isEntityError || hasResponseError) && (
				<div className="tw:max-w-3xl">
					<ErrorContent
						error={
							entityResponse?.error ??
							(entityError instanceof APIError ? entityError : null) ?? {
								code: 500,
								message:
									entityError instanceof Error
										? entityError.message
										: 'Failed to load entity details',
							}
						}
					/>
				</div>
			)}
			{selectedItem && entity && !isEntityLoading && !hasResponseError && (
				<GlobalTimeProvider
					inheritGlobalTime
					enableUrlParams={{
						relativeTimeKey: INFRA_MONITORING_K8S_PARAMS_KEYS.DETAIL_RELATIVE_TIME,
						startTimeKey: INFRA_MONITORING_K8S_PARAMS_KEYS.DETAIL_START_TIME,
						endTimeKey: INFRA_MONITORING_K8S_PARAMS_KEYS.DETAIL_END_TIME,
					}}
				>
					<K8sBaseDetailsContent<T>
						entity={entity}
						category={category}
						eventCategory={eventCategory}
						metadataConfig={metadataConfig}
						countsConfig={countsConfig}
						getCountsFilterExpression={getCountsFilterExpression}
						selectedItem={selectedItem}
						handleClose={handleClose}
						entityWidgetInfo={entityWidgetInfo}
						getEntityQueryPayload={getEntityQueryPayload}
						queryKeyPrefix={queryKeyPrefix}
						hideDetailViewTabs={hideDetailViewTabs}
						tabsConfig={tabsConfig}
						customTabs={customTabs}
						logsAndTracesInitialExpression={logsAndTracesInitialExpression}
						eventsInitialExpression={eventsInitialExpression}
						entityAttributes={entityAttributes}
						entityName={entityName}
					/>
				</GlobalTimeProvider>
			)}
		</EntityDetailSheet>
	);
}
