import { ENTITY_VERSION_V5 } from 'constants/app';
import GridCard from 'container/WidgetCard/Card';
import { Widgets } from 'types/api/widgets/widget';

function MetricOverTimeGraph({
	widget,
	timeRange,
	onDragSelect,
}: {
	widget: Widgets;
	timeRange: { startTime: number; endTime: number };
	onDragSelect: (start: number, end: number) => void;
}): JSX.Element {
	return (
		<section className="endpoint-details-card tw:h-[300px] tw:min-w-0 tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised">
			<GridCard
				widget={widget}
				isQueryEnabled
				onDragSelect={onDragSelect}
				customOnDragSelect={(): void => {}}
				customTimeRange={timeRange}
				customTimeRangeWindowForCoRelation="5m"
				version={ENTITY_VERSION_V5}
			/>
		</section>
	);
}

export default MetricOverTimeGraph;
