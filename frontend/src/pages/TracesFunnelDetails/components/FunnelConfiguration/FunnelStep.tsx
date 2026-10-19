import { useMemo, useState } from 'react';
import cx from 'classnames';
import { FilterSelect } from 'components/CeleryOverview/CeleryOverviewConfigOptions/CeleryOverviewConfigOptions';
import { Button } from 'components/ui/button';
import { Switch } from 'components/ui/switch';
import { QueryParams } from 'constants/query';
import { initialQueriesMap } from 'constants/queryBuilder';
import QueryBuilderSearchV2 from 'container/QueryBuilder/filters/QueryBuilderSearchV2/QueryBuilderSearchV2';
import { PencilLine } from 'lucide-react';
import HintTooltip from 'pages/TracesFunnels/components/HintTooltip/HintTooltip';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';
import { useAppContext } from 'providers/App/App';
import { FunnelStepData } from 'types/api/traceFunnels';
import { DataSource } from 'types/common/queryBuilder';

import FunnelStepPopover from './FunnelStepPopover';
import LatencyPointerMenu from './LatencyPointerMenu';

import './FunnelStep.styles.scss';

interface FunnelStepProps {
	stepData: FunnelStepData;
	index: number;
	stepsCount: number;
}

function FunnelStep({
	stepData,
	index,
	stepsCount,
}: FunnelStepProps): JSX.Element {
	const { handleStepChange: onStepChange, handleStepRemoval: onStepRemove } =
		useFunnelContext();
	const currentQuery = initialQueriesMap[DataSource.TRACES];
	const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);
	const [isAddDetailsModalOpen, setIsAddDetailsModalOpen] =
		useState<boolean>(false);

	const updatedCurrentQuery = useMemo(
		() => ({
			...currentQuery,
			builder: {
				...currentQuery.builder,
				queryData: [
					{
						...currentQuery.builder.queryData[0],
						dataSource: DataSource.TRACES,
						filters: stepData.filters ?? {
							op: 'AND',
							items: [],
						},
					},
				],
			},
		}),
		[stepData.filters, currentQuery],
	);

	const query = updatedCurrentQuery?.builder?.queryData[0] || null;

	const { hasEditPermission } = useAppContext();

	return (
		<div
			className={cx(
				'funnel-step tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:rounded-lg tw:border tw:border-border tw:bg-background',
				{ 'funnel-step--readonly': !hasEditPermission },
			)}
		>
			<div className="fs-ui tw:flex tw:items-start tw:justify-between tw:gap-2 tw:pt-2.5 tw:pr-2 tw:pl-3 tw:font-sans">
				<div className="tw:min-w-0">
					<div className="tw:text-[13px] tw:font-semibold tw:text-foreground">
						{stepData.name || `Step ${index + 1}`}
					</div>
					{!!stepData.description && (
						<div className="tw:text-xs tw:text-muted-foreground">
							{stepData.description}
						</div>
					)}
				</div>
				<div className="tw:flex tw:flex-none tw:items-center tw:gap-0.5">
					<HintTooltip
						title={
							!hasEditPermission
								? 'You need editor or admin access to add details to step'
								: 'Add details to step'
						}
					>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Add details to step"
							onClick={(): void => setIsAddDetailsModalOpen(true)}
							disabled={!hasEditPermission}
							className="tw:text-muted-foreground tw:hover:text-foreground"
						>
							<PencilLine className="tw:size-3.5" />
						</Button>
					</HintTooltip>
					<span aria-hidden="true" className="tw:h-4 tw:w-px tw:bg-border" />
					<FunnelStepPopover
						isPopoverOpen={isPopoverOpen}
						setIsPopoverOpen={setIsPopoverOpen}
						onStepRemove={(): void => onStepRemove(index)}
						stepsCount={stepsCount}
						isAddDetailsModalOpen={isAddDetailsModalOpen}
						setIsAddDetailsModalOpen={setIsAddDetailsModalOpen}
						stepData={{
							step_order: stepData.step_order,
							name: stepData.name,
							description: stepData.description,
						}}
					/>
				</div>
			</div>
			<div
				className={cx(
					'funnel-step__filters tw:flex tw:flex-col tw:gap-2 tw:px-3 tw:py-2.5',
					{ 'tw:pointer-events-none tw:opacity-70': !hasEditPermission },
				)}
			>
				<div className="funnel-step__selects tw:grid tw:grid-cols-2 tw:gap-2">
					<FilterSelect
						placeholder="Select Service"
						queryParam={QueryParams.service}
						filterType="serviceName"
						shouldSetQueryParams={false}
						values={stepData.service_name}
						isMultiple={false}
						onChange={
							hasEditPermission
								? (v): void => {
										onStepChange(index, { service_name: (v ?? '') as string });
									}
								: undefined
						}
					/>
					<FilterSelect
						placeholder="Select Span name"
						queryParam={QueryParams.spanName}
						filterType="name"
						shouldSetQueryParams={false}
						values={stepData.span_name}
						isMultiple={false}
						onChange={
							hasEditPermission
								? (v): void => onStepChange(index, { span_name: (v ?? '') as string })
								: undefined
						}
					/>
				</div>
				<div className="funnel-step__where tw:flex tw:items-center tw:gap-2">
					<span className="tw:w-10 tw:flex-none tw:font-sans tw:text-xs tw:text-muted-foreground">
						Where
					</span>
					<div className="tw:min-w-0 tw:flex-1">
						<QueryBuilderSearchV2
							query={query}
							onChange={
								hasEditPermission
									? (query): void => onStepChange(index, { filters: query })
									: (): void => {}
							}
							hasPopupContainer={false}
							placeholder="Search for filters..."
							rootClassName="traces-funnel-where-filter"
						/>
					</div>
				</div>
			</div>
			<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-border tw:px-3 tw:py-2 tw:font-sans tw:text-xs tw:text-muted-foreground">
				<span className="tw:flex tw:items-center tw:gap-2">
					<HintTooltip
						title={
							!hasEditPermission ? 'You need edit permissions to change this step' : ''
						}
					>
						<Switch
							aria-label="Errors"
							checked={stepData.has_errors}
							disabled={!hasEditPermission}
							onCheckedChange={(): void =>
								onStepChange(index, { has_errors: !stepData.has_errors })
							}
						/>
					</HintTooltip>
					Errors
				</span>
				<span className="tw:flex tw:items-center tw:gap-2">
					Latency pointer
					<LatencyPointerMenu
						index={index}
						value={stepData.latency_pointer}
						editable={hasEditPermission}
						onChange={(value): void =>
							onStepChange(index, { latency_pointer: value })
						}
					/>
				</span>
			</div>
		</div>
	);
}

export default FunnelStep;
