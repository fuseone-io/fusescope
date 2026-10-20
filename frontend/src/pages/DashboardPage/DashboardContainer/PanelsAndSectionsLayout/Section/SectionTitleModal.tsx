import { useEffect, useState } from 'react';
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
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { LoaderCircle } from 'lucide-react';

import { DASHBOARD_NAME_MAX_LENGTH } from '../../constants';

interface SectionTitleModalProps {
	open: boolean;
	/** Modal heading, e.g. "Rename section" / "New section". */
	heading: string;
	/** Confirm button label, e.g. "Rename" / "Create section". */
	okText: string;
	initialValue: string;
	isSaving: boolean;
	placeholder?: string;
	onClose: () => void;
	onSubmit: (title: string) => void;
}

/** Title-entry modal shared by section create and rename (mirrors RenameDashboardModal). */
function SectionTitleModal({
	open,
	heading,
	okText,
	initialValue,
	isSaving,
	placeholder = 'Section name',
	onClose,
	onSubmit,
}: SectionTitleModalProps): JSX.Element {
	const [value, setValue] = useState<string>(initialValue);

	// Reseed the field each time the modal opens.
	useEffect(() => {
		if (open) {
			setValue(initialValue);
		}
	}, [open, initialValue]);

	// `!isSaving` also guards a second submit (e.g. a double Enter) while a request
	// is in flight — otherwise two sections would be created.
	const canSave = value.trim().length > 0 && !isSaving;

	const submit = (): void => {
		if (!canSave) {
			return;
		}
		onSubmit(value.trim());
	};

	const isEmpty = value.trim().length === 0;

	return (
		<Dialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					onClose();
				}
			}}
		>
			<DialogContent
				showCloseButton={false}
				aria-describedby={undefined}
				className="tw:max-w-[440px]"
			>
				<DialogHeader>
					<DialogTitle>{heading}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Input
						data-testid="section-title-input"
						aria-label={placeholder}
						autoFocus
						value={value}
						maxLength={DASHBOARD_NAME_MAX_LENGTH}
						placeholder={placeholder}
						className="tw:h-8 tw:border-input tw:bg-surface-raised tw:text-[13px] tw:text-foreground tw:dark:bg-surface-raised"
						onChange={(e): void => setValue(e.target.value)}
						onKeyDown={(e): void => {
							if (e.key === 'Enter' && canSave) {
								e.preventDefault();
								submit();
							}
						}}
					/>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onClose}
						data-testid="section-title-cancel"
					>
						Cancel
					</Button>
					<TitleTooltip title={isEmpty ? 'Enter a section name first' : undefined}>
						<span className="tw:inline-flex">
							<Button
								type="button"
								size="sm"
								disabled={isEmpty || isSaving}
								aria-busy={isSaving || undefined}
								onClick={submit}
								data-testid="section-title-submit"
							>
								{isSaving && <LoaderCircle className="tw:animate-spin" />}
								<span>{okText}</span>
							</Button>
						</span>
					</TitleTooltip>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default SectionTitleModal;
