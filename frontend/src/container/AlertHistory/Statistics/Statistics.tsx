import { AlertRuleStats } from 'types/api/alerts/def';

import StatsCardsRenderer from './StatsCardsRenderer/StatsCardsRenderer';
import TopContributorsRenderer from './TopContributorsRenderer/TopContributorsRenderer';

function Statistics({
	setTotalCurrentTriggers,
	totalCurrentTriggers,
}: {
	setTotalCurrentTriggers: (value: number) => void;
	totalCurrentTriggers: AlertRuleStats['totalCurrentTriggers'];
}): JSX.Element {
	return (
		<div className="tw:grid tw:grid-cols-1 tw:gap-4 tw:xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
			<section
				aria-label="Statistics"
				className="fs-ui tw:grid tw:grid-cols-1 tw:gap-px tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-border tw:font-sans tw:text-foreground tw:sm:grid-cols-2"
			>
				<StatsCardsRenderer setTotalCurrentTriggers={setTotalCurrentTriggers} />
			</section>
			<TopContributorsRenderer totalCurrentTriggers={totalCurrentTriggers} />
		</div>
	);
}

export default Statistics;
