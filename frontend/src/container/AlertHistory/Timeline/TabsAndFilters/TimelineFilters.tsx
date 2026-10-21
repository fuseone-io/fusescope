import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Button } from 'components/ui/button';
import { TimelineFilter } from 'container/AlertHistory/types';
import history from 'lib/history';
import { Undo2 } from 'lucide-react';

const OPTIONS = [
	{ value: TimelineFilter.ALL, label: 'All', testId: 'timeline-filter-all' },
	{
		value: TimelineFilter.FIRED,
		label: 'Fired',
		testId: 'timeline-filter-fired',
	},
	{
		value: TimelineFilter.RESOLVED,
		label: 'Resolved',
		testId: 'timeline-filter-resolved',
	},
];

function isTimelineFilter(value: string | null): value is TimelineFilter {
	return OPTIONS.some((option) => option.value === value);
}

function TimelineFilters(): JSX.Element {
	const { search } = useLocation();
	const searchParams = useMemo(() => new URLSearchParams(search), [search]);

	const param = searchParams.get('timelineFilter');
	const selected = isTimelineFilter(param) ? param : TimelineFilter.ALL;

	const handleFilter = (value: TimelineFilter): void => {
		searchParams.set('timelineFilter', value);
		history.push({ search: searchParams.toString() });
	};

	return (
		<div className="tw:flex tw:items-center tw:gap-2">
			{selected !== TimelineFilter.ALL && (
				<Button
					variant="ghost"
					size="sm"
					onClick={(): void => handleFilter(TimelineFilter.ALL)}
				>
					<Undo2 aria-hidden="true" />
					Reset
				</Button>
			)}
			<SegmentedControl
				label="Filter by state"
				options={OPTIONS}
				value={selected}
				onChange={handleFilter}
			/>
		</div>
	);
}

export default TimelineFilters;
