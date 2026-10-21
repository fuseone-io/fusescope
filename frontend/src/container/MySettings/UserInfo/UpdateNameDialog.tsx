import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import SettingsDialog from 'pages/Settings/components/SettingsDialog';
import { Check, Loader2 } from 'lucide-react';

interface UpdateNameDialogProps {
	open: boolean;
	name: string;
	isLoading: boolean;
	onNameChange: (name: string) => void;
	onClose: () => void;
	onSave: () => void;
}

function UpdateNameDialog({
	open,
	name,
	isLoading,
	onNameChange,
	onClose,
	onSave,
}: UpdateNameDialogProps): JSX.Element {
	return (
		<SettingsDialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					onClose();
				}
			}}
			title="Update name"
			width="narrow"
			className="update-name-modal"
			bodyClassName="tw:flex tw:flex-col tw:gap-2"
			footer={
				<>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={onSave}
						disabled={isLoading}
						data-testid="update-name-btn"
					>
						{isLoading ? (
							<Loader2 className="tw:animate-spin" aria-hidden="true" />
						) : (
							<Check aria-hidden="true" />
						)}
						<span className="translate-safe">Update name</span>
					</Button>
				</>
			}
		>
			<Label htmlFor="update-name-input" className="tw:text-foreground">
				Name
			</Label>
			<Input
				id="update-name-input"
				placeholder="e.g. John Doe"
				value={name}
				disabled={isLoading}
				onChange={(e): void => onNameChange(e.target.value)}
				onKeyDown={(e): void => {
					if (e.key === 'Enter') {
						onSave();
					}
				}}
			/>
		</SettingsDialog>
	);
}

export default UpdateNameDialog;
