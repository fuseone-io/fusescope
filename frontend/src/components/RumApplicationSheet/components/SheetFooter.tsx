import { ReactNode } from 'react';

interface SheetFooterProps {
	status?: ReactNode;
	children: ReactNode;
}

/** The sheet's pinned bottom bar: status left, actions right. */
function SheetFooter({ status, children }: SheetFooterProps): JSX.Element {
	return (
		<div className="tw:flex tw:flex-none tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-border tw:px-6 tw:py-3">
			<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">{status}</div>
			<div className="tw:flex tw:flex-none tw:items-center tw:gap-2">
				{children}
			</div>
		</div>
	);
}

export default SheetFooter;
