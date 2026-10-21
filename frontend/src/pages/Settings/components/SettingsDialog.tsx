import { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { cn } from 'lib/utils';

const WIDTHS = {
	narrow: 'tw:max-w-md',
	base: 'tw:max-w-lg',
	wide: 'tw:max-w-[700px]',
};

interface SettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	width?: keyof typeof WIDTHS;
	showCloseButton?: boolean;
	className?: string;
	bodyClassName?: string;
	/** Keeps the dialog open on outside clicks, e.g. while an error modal is up. */
	disableOutsideClick?: boolean;
	testId?: string;
}

// antd popups (date pickers, selects) render inside the dialog, so picking from
// them is not an outside click that closes it.
function popupContainer(trigger?: HTMLElement): HTMLElement {
	return (
		trigger?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? document.body
	);
}

/** A settings form or confirmation: title, padded body and a footer of actions. */
function SettingsDialog({
	open,
	onOpenChange,
	title,
	children,
	footer,
	width = 'base',
	showCloseButton = true,
	className,
	bodyClassName,
	disableOutsideClick = false,
	testId,
}: SettingsDialogProps): JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				aria-describedby={undefined}
				data-testid={testId}
				showCloseButton={showCloseButton}
				onInteractOutside={(event): void => {
					if (disableOutsideClick) {
						event.preventDefault();
					}
				}}
				className={cn(WIDTHS[width], 'tw:max-h-[calc(100vh-4rem)]', className)}
			>
				<DialogHeader className="tw:border-b tw:border-border tw:pb-3">
					<DialogTitle className="tw:pr-6">{title}</DialogTitle>
				</DialogHeader>
				<div
					className={cn(
						'tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-5 tw:py-4 tw:text-[13px] tw:text-muted-foreground',
						bodyClassName,
					)}
				>
					<ConfigProvider getPopupContainer={popupContainer}>
						{children}
					</ConfigProvider>
				</div>
				{footer && <DialogFooter>{footer}</DialogFooter>}
			</DialogContent>
		</Dialog>
	);
}

export default SettingsDialog;
