import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Button } from 'components/ui/button';

import { KIND_FILTERS } from '../constants';
import { EventKindFilter, KindCounts } from '../types';

interface TimelineToolbarProps {
	kind: EventKindFilter;
	counts: KindCounts;
	onKindChange: (kind: EventKindFilter) => void;
	onExpandAll: () => void;
	onCollapseAll: () => void;
}

function TimelineToolbar({
	kind,
	counts,
	onKindChange,
	onExpandAll,
	onCollapseAll,
}: TimelineToolbarProps): JSX.Element {
	return (
		<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
			<SegmentedControl
				label="Event types"
				size="sm"
				value={kind}
				onChange={onKindChange}
				options={KIND_FILTERS.map((filter) => ({
					value: filter.value,
					label: filter.label,
					count: filter.value === 'all' ? undefined : counts[filter.value],
					testId: `rum-session-kind-${filter.value}`,
				}))}
			/>
			<span className="tw:flex tw:gap-1">
				<Button
					variant="outline"
					size="sm"
					onClick={onExpandAll}
					data-testid="rum-session-expand-all"
				>
					Expand all
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={onCollapseAll}
					data-testid="rum-session-collapse-all"
				>
					Collapse all
				</Button>
			</span>
		</div>
	);
}

export default TimelineToolbar;
