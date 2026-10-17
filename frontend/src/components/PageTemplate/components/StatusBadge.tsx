import { ReactNode } from 'react';
import { cn } from 'lib/utils';

import { StatusTone } from '../types';

const TONE_CLASSES: Record<StatusTone, string> = {
	neutral: 'tw:bg-muted tw:text-muted-foreground',
	success: 'tw:bg-success-soft tw:text-success-ink',
	warning: 'tw:bg-warning-soft tw:text-warning-ink',
	error: 'tw:bg-error-soft tw:text-error-ink',
	info: 'tw:bg-primary-soft tw:text-primary-ink',
};

interface StatusBadgeProps {
	tone: StatusTone;
	children: ReactNode;
	dot?: boolean;
	className?: string;
	testId?: string;
}

function StatusBadge({
	tone,
	children,
	dot = false,
	className,
	testId,
}: StatusBadgeProps): JSX.Element {
	return (
		<span
			data-tone={tone}
			data-testid={testId}
			className={cn(
				'tw:inline-flex tw:h-5 tw:items-center tw:gap-1.5 tw:rounded-sm tw:px-2 tw:font-sans tw:text-xs tw:font-medium tw:whitespace-nowrap tw:tabular-nums',
				TONE_CLASSES[tone],
				className,
			)}
		>
			{dot && (
				<span
					aria-hidden="true"
					className="tw:size-1.5 tw:flex-none tw:rounded-full tw:bg-current"
				/>
			)}
			{children}
		</span>
	);
}

export default StatusBadge;
