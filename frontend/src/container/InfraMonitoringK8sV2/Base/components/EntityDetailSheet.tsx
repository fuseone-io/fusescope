import { ReactNode } from 'react';
import { SheetOverlay } from 'components/ui/sheet';
import { Dialog as DialogPrimitive } from 'radix-ui';

interface EntityDetailSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** New-UI header row; carries the dialog title. */
	header: ReactNode;
	children: ReactNode;
	testId?: string;
}

/**
 * A right-side sheet for a resource's details. Unlike `SheetContent` the body
 * is not an `fs-ui` scope: it hosts legacy charts, log lists and query editors
 * that the reset would restyle, so only the header opts in.
 */
function EntityDetailSheet({
	open,
	onOpenChange,
	header,
	children,
	testId = 'entity-detail-sheet',
}: EntityDetailSheetProps): JSX.Element {
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<SheetOverlay />
				<DialogPrimitive.Content
					aria-describedby={undefined}
					data-testid={testId}
					onOpenAutoFocus={(e): void => e.preventDefault()}
					className="tw:fixed tw:inset-y-0 tw:right-0 tw:z-50 tw:flex tw:h-full tw:w-[72%] tw:max-w-full tw:min-w-[min(920px,100%)] tw:flex-col tw:overscroll-contain tw:border-l tw:border-border tw:bg-background tw:shadow-lg tw:outline-none tw:data-[state=closed]:animate-out tw:data-[state=closed]:slide-out-to-right tw:data-[state=closed]:duration-300 tw:data-[state=open]:animate-in tw:data-[state=open]:slide-in-from-right tw:data-[state=open]:duration-300"
				>
					{header}
					<div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-y-auto tw:px-6 tw:pt-5 tw:pb-8">
						{children}
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}

export default EntityDetailSheet;
