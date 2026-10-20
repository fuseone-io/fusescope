import { ReactNode } from 'react';
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
import { LoaderCircle, Trash2, X } from 'lucide-react';

interface ConfirmDeleteDialogProps {
	open: boolean;
	title: string;
	description: ReactNode;
	confirmLabel?: string;
	isLoading?: boolean;
	onConfirm: () => void;
	onClose: () => void;
}

/** Shared destructive-confirm dialog for the dashboard, section and panel delete flows. */
function ConfirmDeleteDialog({
	open,
	title,
	description,
	confirmLabel = 'Delete',
	isLoading = false,
	onConfirm,
	onClose,
}: ConfirmDeleteDialogProps): JSX.Element {
	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onClose();
				}
			}}
		>
			<DialogContent showCloseButton={false} className="tw:max-w-[440px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<DialogDescription className="tw:text-[13px]">
						{description}
					</DialogDescription>
				</DialogBody>
				<DialogFooter>
					<Button type="button" variant="ghost" size="sm" onClick={onClose}>
						<X />
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						disabled={isLoading}
						aria-busy={isLoading || undefined}
						onClick={onConfirm}
						data-testid="confirm-delete"
					>
						{isLoading ? <LoaderCircle className="tw:animate-spin" /> : <Trash2 />}
						<span>{confirmLabel}</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default ConfirmDeleteDialog;
