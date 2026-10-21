import TimelineFilters from './TimelineFilters';
import TimelineTabs from './TimelineTabs';

function TabsAndFilters(): JSX.Element {
	return (
		<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
			<TimelineTabs />
			<TimelineFilters />
		</div>
	);
}

export default TabsAndFilters;
