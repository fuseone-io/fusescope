import { useRef } from 'react';
import { ColorPicker } from 'antd';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { Input } from 'components/ui/input';
import { Check, LoaderCircle } from 'lucide-react';

interface EditViewDialogProps {
	open: boolean;
	name: string;
	color: string;
	saving: boolean;
	onNameChange: (name: string) => void;
	onColorChange: (color: string) => void;
	onCancel: () => void;
	onSave: () => void;
}

function EditViewDialog({
	open,
	name,
	color,
	saving,
	onNameChange,
	onColorChange,
	onCancel,
	onSave,
}: EditViewDialogProps): JSX.Element {
	// The picker's panel renders inside the dialog, where the dialog's focus
	// trap and outside-click handling allow it to be used.
	const bodyRef = useRef<HTMLDivElement>(null);

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onCancel();
				}
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="tw:max-w-[384px]"
				aria-describedby={undefined}
			>
				<DialogHeader>
					<DialogTitle>Edit view details</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<label
						htmlFor="edit-view-name"
						className="tw:text-[13px] tw:text-foreground"
					>
						Label
					</label>
					<div ref={bodyRef} className="tw:flex tw:items-center tw:gap-2">
						<ColorPicker
							value={color}
							onChange={(_, hex): void => onColorChange(hex)}
							getPopupContainer={(): HTMLElement => bodyRef.current ?? document.body}
						>
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								aria-label="View colour"
								className="tw:border-input tw:bg-surface-raised tw:dark:bg-surface-raised"
							>
								<span
									aria-hidden="true"
									className="tw:block tw:size-4 tw:rounded-sm"
									style={{ background: color }}
								/>
							</Button>
						</ColorPicker>
						<Input
							id="edit-view-name"
							placeholder="e.g. Crash landing view"
							value={name}
							data-testid="view-name"
							onChange={(e): void => onNameChange(e.target.value)}
							className="tw:h-8 tw:flex-1 tw:border-input tw:bg-surface-raised tw:text-[13px] tw:dark:bg-surface-raised"
						/>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						size="sm"
						data-testid="save-view"
						disabled={saving}
						aria-busy={saving || undefined}
						onClick={onSave}
					>
						{saving ? <LoaderCircle className="tw:animate-spin" /> : <Check />}
						<span>Save changes</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default EditViewDialog;
