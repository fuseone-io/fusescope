import { ReactNode } from 'react';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from 'components/ui/sheet';
import { cn } from 'lib/utils';
import { X } from 'lucide-react';

import AlertsFormTheme from './AlertsFormTheme';

const SHEET_CLASS = 'alerts-form-sheet';

function popupContainer(trigger?: HTMLElement): HTMLElement {
	return trigger?.closest<HTMLElement>(`.${SHEET_CLASS}`) ?? document.body;
}

interface FormSheetProps {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	description?: ReactNode;
	/** The form; put its submit button in `footer` or give the form an id. */
	children: ReactNode;
	footer?: ReactNode;
	testId?: string;
	className?: string;
	/** Off for forms that must only close from their own buttons. */
	closeOnOutsideClick?: boolean;
}

const OPEN_LEGACY_POPUP =
	'.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)';

/**
 * A right-side sheet for a create/edit form: title row, scrolling body and a
 * footer pinned to the bottom. antd popups render inside it, the only layer
 * that takes pointer events while it is open.
 */
function FormSheet({
	open,
	onClose,
	title,
	description,
	children,
	footer,
	testId,
	className,
	closeOnOutsideClick = true,
}: FormSheetProps): JSX.Element {
	return (
		<Sheet
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					onClose();
				}
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				{...(description ? {} : { 'aria-describedby': undefined })}
				data-testid={testId}
				onEscapeKeyDown={(event): void => {
					// Escape closes an open antd dropdown first, not the whole sheet.
					const sheet =
						(event.target as HTMLElement | null)?.closest(`.${SHEET_CLASS}`) ??
						document.querySelector(`.${SHEET_CLASS}`);
					if (sheet?.querySelector(OPEN_LEGACY_POPUP)) {
						event.preventDefault();
					}
				}}
				onInteractOutside={(event): void => {
					if (!closeOnOutsideClick) {
						event.preventDefault();
					}
				}}
				className={cn(
					SHEET_CLASS,
					'tw:w-full tw:max-w-full tw:gap-0 tw:bg-surface-raised tw:p-0 tw:font-sans tw:sm:w-[560px] tw:sm:max-w-[560px]',
					className,
				)}
			>
				<div className="tw:flex tw:flex-none tw:items-start tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-5 tw:py-4">
					<div className="tw:min-w-0">
						<SheetTitle className="tw:text-base tw:leading-tight">{title}</SheetTitle>
						{description && (
							<SheetDescription className="tw:mt-1 tw:text-[13px]">
								{description}
							</SheetDescription>
						)}
					</div>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="tw:-mt-1 tw:-mr-1 tw:flex tw:size-8 tw:flex-none tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-md tw:border-0 tw:bg-transparent tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none"
					>
						<X className="tw:size-4" aria-hidden="true" />
					</button>
				</div>
				<AlertsFormTheme getPopupContainer={popupContainer}>
					<div className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-5 tw:py-4">
						{children}
					</div>
					{footer && (
						<div className="tw:flex tw:flex-none tw:items-center tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3">
							{footer}
						</div>
					)}
				</AlertsFormTheme>
			</SheetContent>
		</Sheet>
	);
}

export default FormSheet;
