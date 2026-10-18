import { ChecklistItem } from '../HomeChecklist/HomeChecklist';

function StepsProgress({
	checklistItems,
}: {
	checklistItems: ChecklistItem[];
}): JSX.Element {
	const completed = checklistItems.filter((item) => item.completed).length;
	const total = checklistItems.length;

	return (
		<progress
			aria-label="Onboarding progress"
			value={completed}
			max={total}
			className="tw:block tw:h-1.5 tw:w-full tw:appearance-none tw:overflow-hidden tw:rounded-full tw:border-0 tw:bg-muted tw:[&::-moz-progress-bar]:bg-primary tw:[&::-webkit-progress-bar]:bg-muted tw:[&::-webkit-progress-value]:rounded-full tw:[&::-webkit-progress-value]:bg-primary"
		/>
	);
}

export default StepsProgress;
