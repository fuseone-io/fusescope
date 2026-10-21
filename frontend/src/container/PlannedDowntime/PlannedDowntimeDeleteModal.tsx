import { SetStateAction } from 'react';
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
import { Trash2, X } from 'lucide-react';

interface PlannedDowntimeDeleteModalProps {
	isDeleteModalOpen: boolean;
	setIsDeleteModalOpen: (value: SetStateAction<boolean>) => void;
	onDeleteHandler: () => void;
	isDeleteLoading: boolean;
	downtimeSchedule: string;
}

export function PlannedDowntimeDeleteModal(
	props: PlannedDowntimeDeleteModalProps,
): JSX.Element {
	const {
		isDeleteModalOpen,
		setIsDeleteModalOpen,
		isDeleteLoading,
		onDeleteHandler,
		downtimeSchedule,
	} = props;
	const hideDeleteScheduleModal = (): void => {
		setIsDeleteModalOpen(false);
	};
	return (
		<Dialog
			open={isDeleteModalOpen}
			onOpenChange={(open): void => {
				if (!open) {
					hideDeleteScheduleModal();
				}
			}}
		>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Delete Schedule</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<DialogDescription>
						{`Are you sure you want to delete - ${downtimeSchedule} schedule? Deleting a schedule is irreversible and cannot be undone.`}
					</DialogDescription>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={hideDeleteScheduleModal}>
						<X aria-hidden="true" />
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={onDeleteHandler}
						disabled={isDeleteLoading}
					>
						<Trash2 aria-hidden="true" />
						Delete Schedule
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
