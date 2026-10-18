import { ReactNode } from 'react';

import { OnboardingQuestionHeader } from '../OnboardingQuestionHeader';

interface QuestionStepProps {
	title: string;
	subtitle: string;
	icon?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
}

/** The card holds legacy widgets (sliders, invite rows), so it has no `fs-ui`. */
function QuestionStep({
	title,
	subtitle,
	icon,
	children,
	footer,
}: QuestionStepProps): JSX.Element {
	return (
		<div className="tw:flex tw:w-full tw:flex-col tw:gap-6 tw:font-sans">
			<OnboardingQuestionHeader title={title} subtitle={subtitle} icon={icon} />

			<div className="tw:flex tw:w-full tw:flex-col tw:gap-6 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:p-6 tw:text-foreground tw:shadow-sm">
				{children}
			</div>

			{footer && (
				<div className="fs-ui tw:flex tw:w-full tw:flex-col tw:gap-2 tw:font-sans">
					{footer}
				</div>
			)}
		</div>
	);
}

export default QuestionStep;
