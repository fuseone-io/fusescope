import { ReactNode } from 'react';

interface StatProps {
	label: string;
	value: ReactNode;
	unit?: ReactNode;
	note?: ReactNode;
	testId?: string;
}

function Stat({ label, value, unit, note, testId }: StatProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className="tw:flex tw:flex-col tw:gap-1.5 tw:bg-surface-raised tw:px-5 tw:py-4"
		>
			<span className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
				{label}
			</span>
			<span className="tw:text-[26px] tw:leading-[1.15] tw:font-semibold tw:tracking-[-0.025em] tw:tabular-nums">
				{value}
				{unit && (
					<span className="tw:ml-1 tw:text-sm tw:font-normal tw:tracking-normal tw:text-muted-foreground">
						{unit}
					</span>
				)}
			</span>
			{note && (
				<span className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-subtle-foreground">
					{note}
				</span>
			)}
		</div>
	);
}

export default Stat;
