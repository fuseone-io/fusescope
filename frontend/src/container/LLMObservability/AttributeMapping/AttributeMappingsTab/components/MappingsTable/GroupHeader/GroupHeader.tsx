import { Tooltip } from '@signozhq/ui/tooltip';
import { cn } from 'lib/utils';
import { ChevronRight } from 'lucide-react';

import { summarizeConditions } from 'container/LLMObservability/AttributeMapping/summaries';
import { DraftGroup } from 'container/LLMObservability/AttributeMapping/types';

import ConditionsTooltip from './ConditionsTooltip';

interface GroupHeaderProps {
	group: DraftGroup;
	open: boolean;
	onToggle: () => void;
}

/** The group's toggle (chevron and name) and its condition summary. */
function GroupHeader({ group, open, onToggle }: GroupHeaderProps): JSX.Element {
	return (
		<div className="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-x-3">
			<button
				type="button"
				aria-expanded={open}
				aria-label={`Toggle ${group.name}`}
				onClick={onToggle}
				data-testid={`group-expand-${group.localId}`}
				className="tw:-ml-2 tw:flex tw:min-w-0 tw:flex-none tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-md tw:border-0 tw:bg-transparent tw:px-2 tw:py-1 tw:text-foreground tw:outline-none tw:hover:bg-muted tw:focus-visible:ring-2 tw:focus-visible:ring-ring"
			>
				<ChevronRight
					aria-hidden="true"
					className={cn(
						'tw:size-4 tw:flex-none tw:text-muted-foreground tw:transition-transform',
						open && 'tw:rotate-90',
					)}
				/>
				<span
					data-testid={`group-name-${group.localId}`}
					className="tw:truncate tw:font-mono tw:text-[13px] tw:font-semibold"
				>
					{group.name}
				</span>
			</button>
			<Tooltip
				title={
					<ConditionsTooltip
						attributes={group.attributes}
						resource={group.resource}
					/>
				}
				side="bottom"
				align="start"
			>
				<span
					data-testid={`group-condition-count-${group.localId}`}
					className="tw:min-w-0 tw:cursor-help tw:truncate tw:text-xs tw:text-muted-foreground"
				>
					{summarizeConditions(group.attributes, group.resource)}
				</span>
			</Tooltip>
		</div>
	);
}

export default GroupHeader;
