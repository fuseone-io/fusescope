import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from 'components/ui/dialog';
import { Trash2 } from 'lucide-react';

import { ClearLabelsDialogProps } from './types';

function ClearLabelsDialog({ onConfirm }: ClearLabelsDialogProps): JSX.Element {
	const { t } = useTranslation('alerts');
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid="alert-labels-clear-button"
					className="tw:text-muted-foreground"
				>
					<Trash2 aria-hidden="true" />
					{t('labels_clear_all')}
				</Button>
			</DialogTrigger>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{t('labels_clear_title')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<DialogDescription>{t('labels_clear_confirm')}</DialogDescription>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={(): void => setOpen(false)}
					>
						{t('labels_clear_cancel')}
					</Button>
					<Button
						type="button"
						variant="destructive"
						data-testid="alert-labels-clear-confirm"
						onClick={(): void => {
							setOpen(false);
							onConfirm();
						}}
					>
						{t('labels_clear_submit')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default ClearLabelsDialog;
