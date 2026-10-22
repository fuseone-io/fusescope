import { useState } from 'react';
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
import { apiErrorMessage } from 'lib/rum/apiError';

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	onConfirm: () => Promise<void>;
	onCancel: () => void;
}

/** A destructive action, confirmed; the server's error stays in the dialog. */
function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel,
	onConfirm,
	onCancel,
}: ConfirmDialogProps): JSX.Element {
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string>();

	return (
		<Dialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					setFailure(undefined);
					onCancel();
				}
			}}
		>
			<DialogContent data-testid="rum-confirm-dialog">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<DialogDescription>{description}</DialogDescription>
					{failure && (
						<span role="alert" className="tw:text-xs tw:text-error">
							{failure}
						</span>
					)}
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" size="sm" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						disabled={busy}
						data-testid="rum-confirm"
						onClick={async (): Promise<void> => {
							setBusy(true);
							try {
								await onConfirm();
								setFailure(undefined);
							} catch (error) {
								setFailure(apiErrorMessage(error));
							} finally {
								setBusy(false);
							}
						}}
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default ConfirmDialog;
