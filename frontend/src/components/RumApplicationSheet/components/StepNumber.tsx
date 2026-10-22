import { ReactNode } from 'react';

function StepNumber({ children }: { children: ReactNode }): JSX.Element {
	return (
		<span className="tw:flex tw:size-[18px] tw:items-center tw:justify-center tw:rounded-full tw:bg-surface-sunken tw:text-[11px] tw:font-semibold tw:text-muted-foreground tw:tabular-nums">
			{children}
		</span>
	);
}

export default StepNumber;
