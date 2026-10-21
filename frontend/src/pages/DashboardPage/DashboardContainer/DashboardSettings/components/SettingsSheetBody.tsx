import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface SettingsSheetBodyProps {
	children: ReactNode;
	className?: string;
}

/** The scrolling part of a settings sheet tab, above its footer. */
function SettingsSheetBody({
	children,
	className,
}: SettingsSheetBodyProps): JSX.Element {
	return (
		<div
			className={cn(
				'tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-6 tw:overflow-y-auto tw:px-6 tw:pt-5 tw:pb-6 tw:[&>*]:flex-none',
				className,
			)}
		>
			{children}
		</div>
	);
}

export default SettingsSheetBody;
