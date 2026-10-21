import { Button } from 'components/ui/button';
import { Loader2 } from 'lucide-react';
import SettingsDialog from 'pages/Settings/components/SettingsDialog';

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
		<SettingsDialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					onCancel();
				}
			}}
			title={title}
			width="narrow"
			footer={
				<>
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
				</>
			}
		>
			<p className="retention-modal-description">{description}</p>
		</SettingsDialog>
	);
}

export default RetentionConfirmDialog;
