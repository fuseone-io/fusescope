import ContentPanel from 'components/PageTemplate/components/ContentPanel';

import GraphWrapper from './GraphWrapper/GraphWrapper';
import TimelineTable from './Table/Table';
import TabsAndFilters from './TabsAndFilters/TabsAndFilters';

function Timeline({
	totalCurrentTriggers,
}: {
	totalCurrentTriggers: number;
}): JSX.Element {
	return (
		<ContentPanel
			title={<span className="timeline__title">Timeline</span>}
			actions={<TabsAndFilters />}
			divided
		>
			<GraphWrapper totalCurrentTriggers={totalCurrentTriggers} />
			<TimelineTable />
		</ContentPanel>
	);
}

export default Timeline;
