import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface InfraEmptyStateProps {
	icon: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
	testId?: string;
}

/** A centred empty or onboarding message: icon tile, title, text and actions. */
function InfraEmptyState({
	icon,
	title,
	description,
	actions,
	className,
	testId,
}: InfraEmptyStateProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className={cn(
				'fs-ui tw:flex tw:flex-col tw:items-center tw:gap-3 tw:px-6 tw:py-12 tw:text-center tw:font-sans',
				className,
			)}
		>
			<span
				aria-hidden="true"
				className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-xl tw:bg-muted tw:text-muted-foreground tw:[&_svg]:size-6"
			>
				{icon}
			</span>
			<h2 className="tw:text-base tw:font-semibold tw:text-foreground">{title}</h2>
			{description && (
				<p className="tw:max-w-[560px] tw:text-[13px] tw:text-muted-foreground">
					{description}
				</p>
			)}
			{actions && (
				<div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-2 tw:pt-1">
					{actions}
				</div>
			)}
		</div>
	);
}

export default InfraEmptyState;
