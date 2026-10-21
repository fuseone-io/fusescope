import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Button } from 'components/ui/button';

import HomeChecklist, { ChecklistItem } from '../HomeChecklist/HomeChecklist';
import StepsProgress from '../StepsProgress/StepsProgress';

interface WelcomeChecklistPanelProps {
	checklistItems: ChecklistItem[];
	onSkip: (item: ChecklistItem) => void;
	onDoLater: () => void;
	isLoading: boolean;
}

function WelcomeChecklistPanel({
	checklistItems,
	onSkip,
	onDoLater,
	isLoading,
}: WelcomeChecklistPanelProps): JSX.Element {
	const completed = checklistItems.filter((item) => item.completed).length;

	return (
		<ContentPanel
			testId="home-welcome-checklist"
			title="Build your observability base"
			subtitle={
				<span className="tw:tabular-nums">
					{completed} of {checklistItems.length} steps done
				</span>
			}
			actions={
				<Button
					variant="link"
					size="sm"
					onClick={onDoLater}
					disabled={isLoading}
					className="tw:h-auto tw:px-0 tw:text-[13px]"
				>
					I&apos;ll do this later
				</Button>
			}
			className="tw:flex-[1_1_340px]"
			bodyClassName="tw:flex tw:flex-col tw:gap-2 tw:px-3 tw:pb-3"
		>
			<div className="fs-ui tw:px-2 tw:pb-1">
				<StepsProgress checklistItems={checklistItems} />
			</div>
			<HomeChecklist
				checklistItems={checklistItems}
				onSkip={onSkip}
				isLoading={isLoading}
			/>
		</ContentPanel>
	);
}

export default WelcomeChecklistPanel;
