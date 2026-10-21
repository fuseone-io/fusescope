import { Info } from 'lucide-react';

import TopContributorsRows from './TopContributorsRows';
import { TopContributorsCardProps } from './types';

function TopContributorsContent({
	topContributorsData,
	totalCurrentTriggers,
}: TopContributorsCardProps): JSX.Element {
	const isEmpty = !topContributorsData.length;

	if (isEmpty) {
		return (
			<div className="fs-ui tw:flex tw:h-full tw:items-center tw:px-5 tw:py-4 tw:font-sans">
				<div className="tw:flex tw:w-full tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:px-4 tw:py-5 tw:text-[13px] tw:text-muted-foreground">
					<Info aria-hidden="true" className="tw:mt-0.5 tw:size-4 tw:flex-none" />
					Top contributors highlight the most frequently triggering group-by
					attributes in multi-dimensional alerts
				</div>
			</div>
		);
	}

	return (
		<TopContributorsRows
			topContributors={topContributorsData.slice(0, 3)}
			totalCurrentTriggers={totalCurrentTriggers}
		/>
	);
}

export default TopContributorsContent;
