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

interface DeleteViewDialogProps {
	open: boolean;
	message: string;
	loading: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

function DeleteViewDialog({
	open,
	message,
	loading,
	onCancel,
	onConfirm,
}: DeleteViewDialogProps): JSX.Element {
	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onCancel();
				}
			}}
		>
			<DialogContent showCloseButton={false} className="tw:max-w-[384px]">
				<DialogHeader>
					<DialogTitle>Delete view</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<DialogDescription>{message}</DialogDescription>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="tw:border-input"
						onClick={onCancel}
					>
						<X />
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						data-testid="confirm-delete"
						disabled={loading}
						aria-busy={loading || undefined}
						onClick={onConfirm}
					>
						{loading ? <LoaderCircle className="tw:animate-spin" /> : <Trash2 />}
						<span>Delete view</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default DeleteViewDialog;
