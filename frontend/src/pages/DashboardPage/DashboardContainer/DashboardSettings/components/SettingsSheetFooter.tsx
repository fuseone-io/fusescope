import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface SettingsSheetFooterProps {
	/** Status on the left: unsaved count, a shortcut hint. */
	status?: ReactNode;
	children: ReactNode;
	className?: string;
}

/** The sheet's pinned bottom bar: status left, actions right. */
function SettingsSheetFooter({
	status,
	children,
	className,
}: SettingsSheetFooterProps): JSX.Element {
	return (
		<div
			className={cn(
				'tw:flex tw:flex-none tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-border tw:px-6 tw:py-3',
				className,
			)}
		>
			<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">{status}</div>
			<div className="tw:flex tw:flex-none tw:items-center tw:gap-2">
				{children}
			</div>
		</div>
	);
}

export default SettingsSheetFooter;
