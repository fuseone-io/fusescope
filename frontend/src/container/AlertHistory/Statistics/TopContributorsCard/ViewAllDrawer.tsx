import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from 'components/ui/sheet';
import { AlertRuleStats, AlertRuleTopContributors } from 'types/api/alerts/def';

import TopContributorsRows from './TopContributorsRows';

function ViewAllDrawer({
	isViewAllVisible,
	toggleViewAllDrawer,
	totalCurrentTriggers,
	topContributorsData,
}: {
	isViewAllVisible: boolean;
	toggleViewAllDrawer: () => void;
	topContributorsData: AlertRuleTopContributors[];
	totalCurrentTriggers: AlertRuleStats['totalCurrentTriggers'];
}): JSX.Element {
	return (
		<Sheet
			open={isViewAllVisible}
			onOpenChange={(open): void => {
				if (!open) {
					toggleViewAllDrawer();
				}
			}}
		>
			<SheetContent
				side="right"
				className="tw:w-full tw:gap-0 tw:overscroll-contain tw:bg-surface-raised tw:font-sans tw:sm:max-w-2xl"
			>
				<SheetHeader className="tw:border-b tw:border-border tw:px-5 tw:py-4">
					<SheetTitle className="tw:text-base">Viewing All Contributors</SheetTitle>
					<SheetDescription className="tw:text-[13px]">
						Series that triggered this alert most often in the selected period.
					</SheetDescription>
				</SheetHeader>
				<div
					className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto"
					data-testid="top-contributors-drawer"
				>
					<TopContributorsRows
						topContributors={topContributorsData}
						totalCurrentTriggers={totalCurrentTriggers}
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}

export default ViewAllDrawer;
