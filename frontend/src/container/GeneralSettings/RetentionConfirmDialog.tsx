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
import { Loader2 } from 'lucide-react';

interface RetentionConfirmDialogProps {
	open: boolean;
	title: string;
	description: string;
	loading: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

function RetentionConfirmDialog({
	open,
	title,
	description,
	loading,
	onCancel,
	onConfirm,
}: RetentionConfirmDialogProps): JSX.Element {
	return (
		<Dialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					onCancel();
				}
			}}
		>
			<DialogContent className="tw:max-w-md">
				<DialogHeader className="tw:border-b tw:border-border tw:pb-3">
					<DialogTitle className="tw:pr-6">{title}</DialogTitle>
				</DialogHeader>
				<DialogBody className="tw:pt-4">
					<DialogDescription className="retention-modal-description">
						{description}
					</DialogDescription>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						data-testid="retention-confirm-cancel"
						onClick={onCancel}
					>
						Cancel
					</Button>
					<Button
						type="button"
						data-testid="retention-confirm-ok"
						onClick={onConfirm}
						disabled={loading}
					>
						{loading && <Loader2 className="tw:animate-spin" aria-hidden="true" />}
						<span className="translate-safe">OK</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default RetentionConfirmDialog;
