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
import { cn } from 'lib/utils';
import { LoaderCircle, X } from 'lucide-react';

interface FunnelDialogConfirm {
	label: string;
	icon: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
	destructive?: boolean;
}

interface FunnelDialogProps {
	open: boolean;
	title: string;
	onCancel: () => void;
	confirm: FunnelDialogConfirm;
	description?: ReactNode;
	children?: ReactNode;
	cancelDisabled?: boolean;
	className?: string;
}

/** The funnels' confirm/edit dialog: title, body, Cancel and one action. */
function FunnelDialog({
	open,
	title,
	onCancel,
	confirm,
	description,
	children,
	cancelDisabled,
	className,
}: FunnelDialogProps): JSX.Element {
	const confirmIcon = confirm.loading ? (
		<LoaderCircle className="tw:size-3.5 tw:animate-spin" />
	) : (
		confirm.icon
	);

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
				className={cn('tw:max-w-[384px]', className)}
				{...(description ? {} : { 'aria-describedby': undefined })}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					{description && <DialogDescription>{description}</DialogDescription>}
					{children}
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onCancel}
						disabled={cancelDisabled}
					>
						<X className="tw:size-3.5" />
						Cancel
					</Button>
					<Button
						type="button"
						variant={confirm.destructive ? 'destructive' : 'default'}
						size="sm"
						onClick={confirm.onClick}
						disabled={confirm.disabled || confirm.loading}
						aria-busy={confirm.loading || undefined}
					>
						{confirmIcon}
						<span>{confirm.label}</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default FunnelDialog;
