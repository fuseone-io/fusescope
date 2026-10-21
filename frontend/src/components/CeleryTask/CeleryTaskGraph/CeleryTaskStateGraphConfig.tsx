import { Dispatch, SetStateAction, useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import { QueryParams } from 'constants/query';
import useUrlQuery from 'hooks/useUrlQuery';
import { cn } from 'lib/utils';

import {
	applyCeleryFilterOnWidgetData,
	getFiltersFromQueryParams,
} from '../CeleryUtils';
import {
	celeryAllStateCountWidgetData,
	celeryFailedStateCountWidgetData,
	celeryRetryStateCountWidgetData,
	celerySuccessStateCountWidgetData,
} from './CeleryTaskGraphUtils';
import { useGetValueFromWidget } from './useGetValueFromWidget';

interface TabData {
	label: string;
	key: string;
	swatch: string;
}

export enum CeleryTaskState {
	All = 'all',
	Failed = 'failed',
	Retry = 'retry',
	Successful = 'successful',
}

function CeleryTaskStateGraphConfig({
	barState,
	setBarState,
}: {
	setBarState: Dispatch<SetStateAction<CeleryTaskState>>;
	barState: CeleryTaskState;
}): JSX.Element {
	const tabs: TabData[] = [
		{ label: 'All tasks', key: CeleryTaskState.All, swatch: 'tw:bg-series-1' },
		{ label: 'Failed', key: CeleryTaskState.Failed, swatch: 'tw:bg-error' },
		{ label: 'Retry', key: CeleryTaskState.Retry, swatch: 'tw:bg-warning' },
		{
			label: 'Successful',
			key: CeleryTaskState.Successful,
			swatch: 'tw:bg-success',
		},
	];

	const urlQuery = useUrlQuery();

	const handleTabClick = (key: CeleryTaskState): void => {
		setBarState(key as CeleryTaskState);
		logEvent('MQ Celery: State graph tab clicked', {
			taskName: urlQuery.get(QueryParams.taskName),
			graphState: key,
		});
	};

	const selectedFilters = useMemo(
		() =>
			getFiltersFromQueryParams(
				QueryParams.taskName,
				urlQuery,
				'celery.task_name',
			),
		[urlQuery],
	);

	const widgetData = [
		celeryAllStateCountWidgetData,
		celeryFailedStateCountWidgetData,
		celeryRetryStateCountWidgetData,
		celerySuccessStateCountWidgetData,
	].map((data) => applyCeleryFilterOnWidgetData(selectedFilters || [], data));

	const { values, isLoading, isError } = useGetValueFromWidget(widgetData, [
		'celery-task-states',
	]);

	const countFor = (index: number): string | number => {
		if (isLoading || isError || Number.isNaN(values[index])) {
			return '-';
		}
		return Math.round(Number(values[index]));
	};

	return (
		<div
			role="group"
			aria-label="Task state"
			className="fs-ui tw:flex tw:flex-wrap tw:gap-1 tw:font-sans"
		>
			{tabs.map((tab, index) => {
				const pressed = tab.key === barState;
				return (
					<button
						key={tab.key}
						type="button"
						aria-pressed={pressed}
						data-testid={`celery-task-state-${tab.key}`}
						onClick={(): void => handleTabClick(tab.key as CeleryTaskState)}
						className={cn(
							'tw:flex tw:min-w-[120px] tw:cursor-pointer tw:flex-col tw:items-start tw:gap-1 tw:rounded-lg tw:border tw:border-transparent tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:transition-colors tw:hover:bg-muted tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none',
							pressed && 'tw:border-border tw:bg-surface-sunken',
						)}
					>
						<span className="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-medium tw:text-muted-foreground">
							<span
								aria-hidden
								className={cn('tw:size-2 tw:rounded-[2px]', tab.swatch)}
							/>
							{tab.label}
						</span>
						<span className="tw:text-lg tw:font-semibold tw:text-foreground tw:tabular-nums">
							{countFor(index)}
						</span>
					</button>
				);
			})}
		</div>
	);
}

export { CeleryTaskStateGraphConfig };
