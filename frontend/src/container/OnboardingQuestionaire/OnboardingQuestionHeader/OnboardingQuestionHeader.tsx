import { ReactNode } from 'react';

import barberPoolUrl from '@/assets/svgs/barber-pool.svg';

interface OnboardingQuestionHeaderProps {
	title: string;
	subtitle: string;
	icon?: ReactNode;
}

export function OnboardingQuestionHeader({
	title,
	subtitle,
	icon,
}: OnboardingQuestionHeaderProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:w-full tw:flex-col tw:items-center tw:gap-2 tw:px-6 tw:text-center tw:font-sans">
			<div className="tw:mb-2 tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-lg tw:border tw:border-border tw:bg-primary-soft tw:text-2xl tw:leading-none">
				{icon ?? <img src={barberPoolUrl} alt="FuseScope" width="28" height="28" />}
			</div>
			<h1 className="tw:text-xl tw:font-semibold tw:tracking-tight tw:text-foreground">
				{title}
			</h1>
			<p className="tw:max-w-[528px] tw:text-sm tw:text-muted-foreground">
				{subtitle}
			</p>
		</div>
	);
}
