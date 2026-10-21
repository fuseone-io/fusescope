import { MouseEvent, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from 'react-query';
import setLocalStorage from 'api/browser/localstorage/set';
import {
	invalidateGetChecks,
	useGetChecks,
} from 'api/generated/services/inframonitoring';
import { InframonitoringtypesCheckTypeDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { ChevronDown, ChevronUp, RefreshCw, TriangleAlert } from 'lucide-react';

import { InfraMonitoringEntity } from '../../../constants';
import { CheckEntryRow } from './CheckEntryRow';
import {
	countEntries,
	ENTITY_TO_CHECK_TYPE,
	getStorageKey,
	readExpandedState,
	toCheckRows,
} from './utils';

export interface InstrumentationChecksCalloutProps {
	entity: InfraMonitoringEntity;
}

export function K8sInstrumentationChecksCallout({
	entity,
}: InstrumentationChecksCalloutProps): JSX.Element | null {
	const checkType = ENTITY_TO_CHECK_TYPE[entity];
	const queryClient = useQueryClient();

	const [isExpanded, setIsExpanded] = useState(() => readExpandedState(entity));

	const { data, isLoading, isFetching } = useGetChecks(
		{ type: checkType as InframonitoringtypesCheckTypeDTO },
		{ query: { enabled: !!checkType } },
	);

	const handleRecheck = useCallback(
		(e: MouseEvent): void => {
			e.preventDefault();
			e.stopPropagation();

			if (checkType) {
				void invalidateGetChecks(queryClient, { type: checkType });
			}
		},
		[queryClient, checkType],
	);

	const handleExpandToggle = useCallback((): void => {
		setIsExpanded((prev) => {
			const next = !prev;
			setLocalStorage(getStorageKey(entity), String(next));
			return next;
		});
	}, [entity]);

	const checksData = data?.data;

	const rows = useMemo(
		() => (checksData ? toCheckRows(checksData) : []),
		[checksData],
	);

	if (!checkType || isLoading || !checksData || checksData.ready) {
		return null;
	}

	const { total, missing } = countEntries(rows);

	if (total === 0) {
		return null;
	}

	return (
		<section
			role="status"
			aria-label="Instrumentation checks"
			className={cn(
				'fs-ui tw:rounded-xl tw:px-4 tw:pt-3 tw:font-sans',
				isExpanded ? 'tw:pb-1.5' : 'tw:pb-3',
				missing > 0
					? 'tw:bg-warning-soft tw:text-warning-ink'
					: 'tw:bg-primary-soft tw:text-primary-ink',
			)}
		>
			<div
				className={cn(
					'tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2',
					isExpanded && 'tw:pb-2',
				)}
			>
				<span className="tw:flex tw:items-center tw:gap-2.5">
					<TriangleAlert size={18} aria-hidden="true" />
					<strong className="tw:text-sm tw:font-semibold">
						Instrumentation checks
					</strong>
					<span className="tw:text-[13px] tw:tabular-nums">
						{missing} of {total} need attention
					</span>
				</span>
				<span className="tw:flex tw:gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onClick={handleRecheck}
						disabled={isFetching}
						data-testid="instrumentation-checks-recheck-btn"
						className="tw:border-current tw:bg-transparent tw:text-inherit tw:hover:bg-transparent tw:hover:text-inherit"
					>
						<RefreshCw className={cn(isFetching && 'tw:animate-spin')} />
						Recheck
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={isExpanded ? 'Collapse checks' : 'Expand checks'}
						aria-expanded={isExpanded}
						onClick={handleExpandToggle}
						className="tw:text-inherit tw:hover:bg-transparent tw:hover:text-inherit"
					>
						{isExpanded ? <ChevronUp /> : <ChevronDown />}
					</Button>
				</span>
			</div>
			{isExpanded &&
				rows.map((row) => (
					<CheckEntryRow
						key={`${row.kind}-${row.componentName}`}
						passed={row.passed}
						typeLabel={row.typeLabel}
						items={row.items}
						componentName={row.componentName}
						documentationLink={row.documentationLink}
					/>
				))}
		</section>
	);
}
