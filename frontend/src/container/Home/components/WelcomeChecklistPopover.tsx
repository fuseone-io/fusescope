import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from 'components/ui/popover';
import { ClipboardList } from 'lucide-react';

import HomeChecklist, { ChecklistItem } from '../HomeChecklist/HomeChecklist';

interface WelcomeChecklistPopoverProps {
	checklistItems: ChecklistItem[];
	onSkip: (item: ChecklistItem) => void;
	isLoading: boolean;
}

/** The checklist behind a header button once "I'll do this later" was chosen. */
function WelcomeChecklistPopover({
	checklistItems,
	onSkip,
	isLoading,
}: WelcomeChecklistPopoverProps): JSX.Element {
	return (
		<Popover
			onOpenChange={(open): void => {
				if (open) {
					void logEvent('Welcome Checklist: Expanded', {});
				} else {
					void logEvent('Welcome Checklist: Minimized', {});
				}
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
				>
					<ClipboardList aria-hidden="true" />
					Welcome checklist
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="tw:max-h-[70vh] tw:w-[360px] tw:overflow-y-auto tw:bg-surface-raised tw:p-3 tw:font-sans"
			>
				<HomeChecklist
					checklistItems={checklistItems}
					onSkip={onSkip}
					isLoading={isLoading}
				/>
			</PopoverContent>
		</Popover>
	);
}

export default WelcomeChecklistPopover;
