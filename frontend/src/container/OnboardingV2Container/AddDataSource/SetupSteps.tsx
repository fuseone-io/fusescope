import { Fragment } from 'react';
import { cn } from 'lib/utils';
import { Check } from 'lucide-react';

export interface SetupStepItem {
	title: string;
	description: string;
}

interface SetupStepsProps {
	steps: SetupStepItem[];
	currentStep: number;
}

function SetupSteps({ steps, currentStep }: SetupStepsProps): JSX.Element {
	return (
		<ol className="fs-ui tw:flex tw:list-none tw:h-16 tw:items-center tw:gap-3 tw:px-4 tw:font-sans tw:md:px-8">
			{steps.map((step, index) => {
				const isDone = index < currentStep;
				const isCurrent = index === currentStep;

				return (
					<Fragment key={step.title}>
						{index > 0 && (
							<li
								aria-hidden
								className={cn(
									'tw:h-px tw:min-w-6 tw:flex-1',
									isDone || isCurrent ? 'tw:bg-primary' : 'tw:bg-border',
								)}
							/>
						)}
						<li
							aria-current={isCurrent ? 'step' : undefined}
							className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5"
						>
							<span
								className={cn(
									'tw:flex tw:size-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:border tw:text-xs tw:font-semibold',
									isDone && 'tw:border-primary tw:bg-primary-soft tw:text-primary-ink',
									isCurrent &&
										'tw:border-primary tw:bg-primary tw:text-primary-foreground',
									!isDone &&
										!isCurrent &&
										'tw:border-border tw:bg-surface-raised tw:text-muted-foreground',
								)}
							>
								{isDone ? <Check className="tw:size-3.5" aria-hidden /> : index + 1}
							</span>
							<span className="tw:flex tw:min-w-0 tw:flex-col">
								<span
									className={cn(
										'tw:truncate tw:text-sm tw:font-medium',
										isDone || isCurrent
											? 'tw:text-foreground'
											: 'tw:text-muted-foreground',
									)}
								>
									{step.title}
								</span>
								{step.description.trim() && (
									<span className="tw:max-w-40 tw:truncate tw:text-xs tw:text-muted-foreground">
										{step.description}
									</span>
								)}
							</span>
						</li>
					</Fragment>
				);
			})}
		</ol>
	);
}

export default SetupSteps;
