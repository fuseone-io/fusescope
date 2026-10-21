import { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import { cn } from 'lib/utils';
import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';

const SHEET_CLASS = 'fs-side-sheet';

const OPEN_LEGACY_POPUP =
	'.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)';

function popupContainer(trigger?: HTMLElement): HTMLElement {
	return trigger?.closest<HTMLElement>(`.${SHEET_CLASS}`) ?? document.body;
}

export interface SideSheetProps {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	/** One line under the title: the selection, a time window, a unit. */
	subtitle?: ReactNode;
	/** Buttons beside the close button. */
	actions?: ReactNode;
	/** Tabs or a filter row between the header and the body. */
	toolbar?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	/** Width from `sm` up, in px. */
	width?: number;
	/**
	 * Off, the page behind stays usable and the sheet has no overlay: for a
	 * detail that follows what the user selects on the page.
	 */
	modal?: boolean;
	testId?: string;
	className?: string;
	bodyClassName?: string;
}

/**
 * A right-side panel for the detail of a selection or a checklist: title row,
 * optional toolbar, a scrolling body and a footer. antd popups render inside it.
 */
function SideSheet({
	open,
	onClose,
	title,
	subtitle,
	actions,
	toolbar,
	children,
	footer,
	width = 560,
	modal = true,
	testId,
	className,
	bodyClassName,
}: SideSheetProps): JSX.Element {
	return (
		<SheetPrimitive.Root
			open={open}
			modal={modal}
			onOpenChange={(next): void => {
				if (!next) {
					onClose();
				}
			}}
		>
			<SheetPrimitive.Portal>
				{modal && (
					<SheetPrimitive.Overlay className="fs-ui tw:fixed tw:inset-0 tw:z-50 tw:bg-black/50 tw:data-[state=closed]:animate-out tw:data-[state=closed]:fade-out-0 tw:data-[state=open]:animate-in tw:data-[state=open]:fade-in-0" />
				)}
				<SheetPrimitive.Content
					data-testid={testId}
					aria-describedby={undefined}
					onOpenAutoFocus={(event): void => {
						if (!modal) {
							event.preventDefault();
						}
					}}
					onEscapeKeyDown={(event): void => {
						const sheet = document.querySelector(`.${SHEET_CLASS}`);
						if (sheet?.querySelector(OPEN_LEGACY_POPUP)) {
							event.preventDefault();
						}
					}}
					onInteractOutside={(event): void => {
						if (!modal) {
							event.preventDefault();
						}
					}}
					style={{ ['--fs-side-sheet-width' as string]: `${width}px` }}
					className={cn(
						'fs-ui',
						SHEET_CLASS,
						'tw:fixed tw:inset-y-0 tw:right-0 tw:z-50 tw:flex tw:h-full tw:w-full tw:max-w-full tw:flex-col tw:border-l tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground tw:shadow-lg tw:outline-none tw:sm:w-(--fs-side-sheet-width)',
						'tw:data-[state=closed]:animate-out tw:data-[state=closed]:slide-out-to-right tw:data-[state=open]:animate-in tw:data-[state=open]:slide-in-from-right',
						className,
					)}
				>
					<div className="tw:flex tw:flex-none tw:items-start tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-5 tw:py-4">
						<div className="tw:min-w-0">
							<SheetPrimitive.Title className="tw:text-base tw:leading-tight tw:font-semibold tw:break-words">
								{title}
							</SheetPrimitive.Title>
							{subtitle && (
								<div className="tw:mt-1 tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1 tw:text-xs tw:text-muted-foreground">
									{subtitle}
								</div>
							)}
						</div>
						<div className="tw:-mt-1 tw:-mr-1 tw:flex tw:flex-none tw:items-center tw:gap-1">
							{actions}
							<button
								type="button"
								aria-label="Close"
								onClick={onClose}
								data-testid={testId ? `${testId}-close` : undefined}
								className="tw:flex tw:size-8 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-md tw:border-0 tw:bg-transparent tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none"
							>
								<X className="tw:size-4" aria-hidden="true" />
							</button>
						</div>
					</div>
					<ConfigProvider getPopupContainer={popupContainer}>
						{toolbar && (
							<div className="tw:flex-none tw:border-b tw:border-border tw:px-5">
								{toolbar}
							</div>
						)}
						<div
							className={cn(
								'tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-5 tw:py-4 tw:[&>*]:flex-none',
								bodyClassName,
							)}
						>
							{children}
						</div>
						{footer && (
							<div className="tw:flex tw:flex-none tw:items-center tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3">
								{footer}
							</div>
						)}
					</ConfigProvider>
				</SheetPrimitive.Content>
			</SheetPrimitive.Portal>
		</SheetPrimitive.Root>
	);
}

export default SideSheet;
