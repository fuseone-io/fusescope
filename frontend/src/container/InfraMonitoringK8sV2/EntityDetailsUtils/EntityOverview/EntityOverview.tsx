import { useCallback, useMemo, useState } from 'react';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { ChevronDown, Compass } from 'lucide-react';
import {
	QuerySearchV2Provider,
	useExpression,
	useInputExpression,
	useQuerySearchInitialExpressionProp,
	useQuerySearchOnChange,
	useQuerySearchOnRun,
	useUserExpression,
} from 'components/QueryBuilderV2';
import QuerySearch from 'components/QueryBuilderV2/QueryV2/QuerySearch/QuerySearch';
import {
	combineInitialAndUserExpression,
	getUserExpressionFromCombined,
} from 'components/QueryBuilderV2/QueryV2/QuerySearch/utils';
import RunQueryBtn from 'container/QueryBuilder/components/RunQueryBtn/RunQueryBtn';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';
import { openInNewTab } from 'utils/navigation';
import { validateQuery } from 'utils/queryValidationUtils';

import { getEntityConfig } from '../../Base/entity.registry';
import { logInfraExplorerNavigatedEvent } from '../../Base/events';
import {
	buildRelatedFilterClauses,
	EntityAttributes,
	formatRelatedFilterClause,
	RelatedFilterClause,
	getEntityNameAttributeKey,
	getRelatedCategories,
	resolveRelatedCategory,
} from '../../Base/relations';
import { getDrawerDurationMs } from '../../Base/useDrawerLifecycleStore';
import { buildK8sListNavigationUrl } from '../../Base/utils';
import {
	INFRA_MONITORING_K8S_PARAMS_KEYS,
	InfraMonitoringEntity,
	K8S_CATEGORY_LABELS,
	K8S_CATEGORY_SINGULAR_LABELS,
	METRIC_NAMESPACE_BY_ENTITY,
	VIEW_TYPES,
} from '../../constants';
import EntityTabToolbar from '../EntityTabToolbar';
import EntityDateTimeSelector from '../EntityDateTimeSelector/EntityDateTimeSelector';
import { useEntityDetailsTime } from '../EntityDateTimeSelector/useEntityDetailsTime';
import { logInfraDrawerFilterCustomizedEvent } from '../events';
import { RelatedEntitiesTable } from './RelatedEntitiesTable';
import { ScopeChip } from './ScopeChip';
import { useCarriedOverFilters } from './useCarriedOverFilters';
import { useRelatedEntities } from './useRelatedEntities';

import styles from './EntityOverview.module.scss';

export interface EntityOverviewProps {
	category: InfraMonitoringEntity;
	eventEntity: string;
	/** The drawer entity's own attributes, which scope every related query */
	attributes: EntityAttributes;
	/** The drawer's own record and query prefix, so a row click can leave a
	 * trail that steps back without fetching again */
	entity: unknown;
	entityName: string;
	queryKeyPrefix: string;
}

interface ContentProps extends EntityOverviewProps {
	targetCategory: InfraMonitoringEntity;
	lockedExpression: string;
	lockedClauses: RelatedFilterClause[];
	onCategoryChange: (category: string) => void;
}

function EntityOverviewContent({
	category,
	eventEntity,
	attributes,
	entity,
	entityName,
	queryKeyPrefix,
	targetCategory,
	lockedExpression,
	lockedClauses,
	onCategoryChange,
}: ContentProps): JSX.Element | null {
	const { timeRange } = useEntityDetailsTime();
	const expression = useExpression();
	const userExpression = useUserExpression();
	const inputExpression = useInputExpression();
	const querySearchOnChange = useQuerySearchOnChange();
	const querySearchOnRun = useQuerySearchOnRun();
	const querySearchInitialExpressionProp = useQuerySearchInitialExpressionProp();

	const targetConfig = getEntityConfig(targetCategory);

	useCarriedOverFilters(targetCategory);

	const {
		records,
		total,
		isLoading,
		isFetching,
		isError,
		error,
		endTimeBeforeRetention,
		setPage,
		setLimit,
		refetch,
		cancel,
	} = useRelatedEntities({
		fetchListData: targetConfig?.list.fetchListData,
		queryKey: `${targetCategory}RelatedEntities`,
		expression,
		timeRange,
	});

	// The editor holds only what the user typed; the locked scope is shown beside it
	const queryData = useMemo(
		(): IBuilderQuery =>
			({
				aggregateOperator: 'noop',
				filter: { expression: userExpression },
			}) as IBuilderQuery,
		[userExpression],
	);

	const handleCategoryChange = useCallback(
		(value: string): void => {
			onCategoryChange(value);
		},
		[onCategoryChange],
	);

	const handleRunQuery = useCallback(
		(updatedExpression?: string): void => {
			const newUserExpression = updatedExpression
				? getUserExpressionFromCombined(lockedExpression, updatedExpression)
				: inputExpression;

			const validation = validateQuery(
				combineInitialAndUserExpression(lockedExpression, newUserExpression || ''),
			);

			if (!validation.isValid) {
				return;
			}

			querySearchOnRun(newUserExpression);
			logInfraDrawerFilterCustomizedEvent(
				category,
				VIEW_TYPES.OVERVIEW,
				newUserExpression || '',
				'search',
			);
			refetch();
		},
		[lockedExpression, inputExpression, querySearchOnRun, category, refetch],
	);

	const handleNavigate = useCallback((): void => {
		logInfraExplorerNavigatedEvent({
			entityType: category,
			destination: 'k8s_list',
			source: 'overview_cta',
			tab: VIEW_TYPES.OVERVIEW,
			sourceKey: targetCategory,
			drawerDurationMsAtNavigation: getDrawerDurationMs(),
		});

		openInNewTab(buildK8sListNavigationUrl(targetCategory, expression));
	}, [category, targetCategory, expression]);

	if (!targetConfig) {
		return null;
	}

	const targetLabel = K8S_CATEGORY_LABELS[targetCategory];

	return (
		<div className={styles.container}>
			<EntityTabToolbar
				time={
					<EntityDateTimeSelector
						eventEntity={eventEntity}
						category={category}
						view={VIEW_TYPES.OVERVIEW}
					/>
				}
				run={
					<RunQueryBtn
						isLoadingQueries={isFetching}
						onStageRunQuery={(): void => handleRunQuery()}
						handleCancelQuery={cancel}
					/>
				}
				prefix={<ScopeChip clauses={lockedClauses} expression={lockedExpression} />}
				search={
					<div className={styles.filterInput}>
						<QuerySearch
							queryData={queryData}
							dataSource={DataSource.METRICS}
							onChange={querySearchOnChange}
							onRun={handleRunQuery}
							signalSource=""
							showFilterSuggestionsWithoutMetric
							placeholder={`Filter these ${targetLabel.toLowerCase()}`}
							metricNamespace={METRIC_NAMESPACE_BY_ENTITY[targetCategory]}
							initialExpression={querySearchInitialExpressionProp}
						/>
					</div>
				}
			/>

			<RelatedEntitiesTable
				key={targetCategory}
				targetCategory={targetCategory}
				header={
					<div className="fs-ui tw:flex tw:flex-none tw:items-center tw:gap-2 tw:font-sans">
						<span className="tw:text-[13px] tw:text-muted-foreground">Showing</span>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="tw:min-w-44 tw:justify-between"
									data-testid="overview-resource-select"
								>
									{targetLabel}
									<ChevronDown className="tw:text-muted-foreground" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="tw:z-[1100] tw:min-w-44">
								<DropdownMenuRadioGroup
									value={targetCategory}
									onValueChange={handleCategoryChange}
								>
									{getRelatedCategories(category, attributes).map((relatedCategory) => (
										<DropdownMenuRadioItem
											key={relatedCategory}
											value={relatedCategory}
											data-testid={`overview-resource-option-${relatedCategory}`}
										>
											{K8S_CATEGORY_LABELS[relatedCategory]}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>

						<TitleTooltip title={`View on ${targetLabel.toLowerCase()} page`}>
							<Button
								variant="ghost"
								size="icon-sm"
								className="tw:text-muted-foreground"
								aria-label={`View on ${targetLabel.toLowerCase()} page`}
								onClick={handleNavigate}
								data-testid="overview-view-on-list-page"
							>
								<Compass />
							</Button>
						</TitleTooltip>
					</div>
				}
				listConfig={targetConfig.list}
				records={records}
				total={total}
				isLoading={isLoading}
				isError={isError}
				error={error}
				endTimeBeforeRetention={endTimeBeforeRetention}
				source={{ category, label: entityName, entity, queryKeyPrefix }}
				onPageChange={setPage}
				onLimitChange={setLimit}
			/>
		</div>
	);
}

export default function EntityOverview(
	props: EntityOverviewProps,
): JSX.Element | null {
	const { category, attributes } = props;

	// Tied to the resource it was picked on, so another drawer starts at its
	// own default instead of inheriting the last pick
	const [selection, setSelection] = useState<{
		identity: string;
		category: string;
	} | null>(null);

	const identity = `${category}:${
		attributes[getEntityNameAttributeKey(category)] ?? ''
	}`;

	const targetCategory = resolveRelatedCategory(
		category,
		attributes,
		selection?.identity === identity ? selection.category : null,
	);

	const handleCategoryChange = useCallback(
		(value: string): void => setSelection({ identity, category: value }),
		[identity],
	);

	const lockedClauses = targetCategory
		? buildRelatedFilterClauses(category, targetCategory, attributes)
		: [];
	const lockedExpression = lockedClauses
		.map(formatRelatedFilterClause)
		.join(' AND ');

	if (!targetCategory) {
		return (
			<div className={styles.noRelations}>
				<p className="tw:font-sans tw:text-[13px] tw:text-muted-foreground">
					{`Nothing related to this ${K8S_CATEGORY_SINGULAR_LABELS[category]} was reported in this time range.`}
				</p>
			</div>
		);
	}

	return (
		<QuerySearchV2Provider
			queryParamKey={INFRA_MONITORING_K8S_PARAMS_KEYS.OVERVIEW_EXPRESSION}
			initialExpression={lockedExpression}
		>
			<EntityOverviewContent
				{...props}
				targetCategory={targetCategory}
				lockedExpression={lockedExpression}
				lockedClauses={lockedClauses}
				onCategoryChange={handleCategoryChange}
			/>
		</QuerySearchV2Provider>
	);
}
