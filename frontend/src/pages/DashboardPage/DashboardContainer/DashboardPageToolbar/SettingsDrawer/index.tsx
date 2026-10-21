import { memo, ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import { cn } from 'lib/utils';
import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';

const SHEET_CLASS = 'fs-dashboard-sheet';

const OPEN_LEGACY_POPUP =
	'.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)';

// Layers that portal to <body> but belong to the sheet's session: antd modals
// (the error modal), toasts and legacy tooltips/popovers.
const SHEET_COMPANION_LAYER =
	'.ant-modal-root, .ant-modal-wrap, .ant-tooltip, .ant-popover, .ant-select-dropdown, .ant-dropdown, [data-sonner-toaster], [data-radix-popper-content-wrapper], [role="dialog"]';

function popupContainer(trigger?: HTMLElement): HTMLElement {
	return trigger?.closest<HTMLElement>(`.${SHEET_CLASS}`) ?? document.body;
}

type SettingsDrawerProps = {
	drawerTitle: string;
	/** One line under the title, e.g. the dashboard name. */
	subtitle?: ReactNode;
	isOpen: boolean;
	onClose: () => void;
	/** Fills the sheet below the title row: tabs or a toolbar, a body and a footer. */
	children: ReactNode;
	testId?: string;
};

/**
 * A 680px right-side sheet for the dashboard's settings and JSON. Non-modal so
 * the app's antd error modal and toasts stay usable above it; the scrim and
 * outside clicks still close it. Content unmounts on close.
 */
function SettingsDrawer({
	children,
	drawerTitle,
	subtitle,
	isOpen,
	onClose,
	testId,
}: SettingsDrawerProps): JSX.Element {
	return (
		<SheetPrimitive.Root
			open={isOpen}
			modal={false}
			onOpenChange={(next): void => {
				if (!next) {
					onClose();
				}
			}}
		>
			<SheetPrimitive.Portal>
				<div
					aria-hidden="true"
					className="fs-ui tw:fixed tw:inset-0 tw:z-50 tw:bg-black/50 tw:animate-in tw:fade-in-0"
				/>
				<SheetPrimitive.Content
					data-testid={testId}
					aria-describedby={undefined}
					onEscapeKeyDown={(event): void => {
						const sheet = document.querySelector(`.${SHEET_CLASS}`);
						if (sheet?.querySelector(OPEN_LEGACY_POPUP)) {
							event.preventDefault();
						}
					}}
					onInteractOutside={(event): void => {
						const target = event.target as Element | null;
						if (target?.closest?.(SHEET_COMPANION_LAYER)) {
							event.preventDefault();
						}
					}}
					className={cn(
						'fs-ui',
						SHEET_CLASS,
						'tw:fixed tw:inset-y-0 tw:right-0 tw:z-50 tw:flex tw:h-full tw:w-full tw:max-w-full tw:flex-col tw:border-l tw:border-border tw:bg-surface-raised tw:font-sans tw:text-[13px] tw:text-foreground tw:shadow-[-8px_0_24px_rgba(10,22,40,0.12)] tw:outline-none tw:sm:w-[680px] tw:dark:shadow-[-8px_0_24px_rgba(0,0,0,0.4)]',
						'tw:data-[state=open]:animate-in tw:data-[state=open]:slide-in-from-right',
					)}
				>
					<div className="tw:flex tw:flex-none tw:items-center tw:justify-between tw:gap-3 tw:pt-4 tw:pr-4 tw:pb-2 tw:pl-6">
						<div className="tw:flex tw:min-w-0 tw:flex-col">
							<SheetPrimitive.Title className="tw:m-0 tw:text-base tw:leading-snug tw:font-semibold tw:text-foreground">
								{drawerTitle}
							</SheetPrimitive.Title>
							{subtitle && (
								<span className="tw:truncate tw:text-xs tw:text-subtle-foreground">
									{subtitle}
								</span>
							)}
						</div>
						<button
							type="button"
							aria-label="Close"
							onClick={onClose}
							data-testid={testId ? `${testId}-close` : undefined}
							className="tw:flex tw:size-8 tw:flex-none tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-md tw:border-0 tw:bg-transparent tw:text-muted-foreground tw:hover:bg-surface-sunken tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none"
						>
							<X className="tw:size-4" aria-hidden="true" />
						</button>
					</div>
					<ConfigProvider getPopupContainer={popupContainer}>
						<div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">{children}</div>
					</ConfigProvider>
				</SheetPrimitive.Content>
			</SheetPrimitive.Portal>
		</SheetPrimitive.Root>
	);
}

export default memo(SettingsDrawer);
