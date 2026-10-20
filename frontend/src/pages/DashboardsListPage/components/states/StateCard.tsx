import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface StateCardProps {
	icon: ReactNode;
	tone?: 'primary' | 'error' | 'neutral';
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	testId?: string;
}

const TONE: Record<NonNullable<StateCardProps['tone']>, string> = {
	primary: 'tw:bg-primary-soft tw:text-primary-ink',
	error: 'tw:bg-error-soft tw:text-error-ink',
	neutral: 'tw:bg-muted tw:text-muted-foreground',
};

/** The list's empty, error and no-results card: icon tile, copy, actions. */
function StateCard({
	icon,
	tone = 'primary',
	title,
	description,
	actions,
	testId,
}: StateCardProps): JSX.Element {
	return (
		<section
			data-testid={testId}
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:py-12 tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:w-full tw:max-w-[440px] tw:flex-col tw:gap-4">
				<div className="tw:flex tw:flex-col tw:gap-2.5">
					<span
						aria-hidden="true"
						className={cn(
							'tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-[10px] tw:[&_svg]:size-5',
							TONE[tone],
						)}
					>
						{icon}
					</span>
					<p className="tw:m-0 tw:text-sm tw:font-semibold">{title}</p>
					{description && (
						<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				{actions && (
					<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
						{actions}
					</div>
				)}
			</div>
		</section>
	);
}

export default StateCard;
