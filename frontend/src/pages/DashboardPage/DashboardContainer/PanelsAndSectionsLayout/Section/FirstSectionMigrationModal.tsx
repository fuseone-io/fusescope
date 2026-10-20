import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';

interface FirstSectionMigrationModalProps {
	open: boolean;
	isSaving: boolean;
	onClose: () => void;
	onConfirm: () => void;
}

/**
 * Shown when the user adds the first section to a free-flowing dashboard that
 * already has panels. Confirms grouping the existing panels into a section
 * before proceeding.
 */
function FirstSectionMigrationModal({
	open,
	isSaving,
	onClose,
	onConfirm,
}: FirstSectionMigrationModalProps): JSX.Element {
	return (
		<Dialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					onClose();
				}
			}}
		>
			<DialogContent className="tw:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Group panels into sections?</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<DialogDescription className="tw:text-[13px]">
						This dashboard&apos;s panels are currently free-flowing. Adding a section
						will move the existing panels into their own section, and a new empty
						section will be added below. You can rename sections afterwards.
					</DialogDescription>
				</DialogBody>
				<DialogFooter>
					<Button type="button" variant="ghost" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={isSaving}
						onClick={onConfirm}
						data-testid="confirm-migration"
					>
						Continue
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default FirstSectionMigrationModal;
