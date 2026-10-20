import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { RotateCcw } from 'lucide-react';

import { SPACE_AGGREGATION_LINK, TEMPORAL_AGGREGATION_LINK } from './constants';
import StepNumber, { StepState } from './StepNumber';
import { InspectionStep, StepperProps } from './types';

function stateOf(
	inspectionStep: InspectionStep,
	step: InspectionStep,
): StepState {
	if (inspectionStep > step) {
		return 'done';
	}
	return inspectionStep === step ? 'current' : 'pending';
}

function DocLink({
	href,
	children,
}: {
	href: string;
	children: ReactNode;
}): JSX.Element {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="tw:text-primary! tw:hover:underline"
		>
			{children}
		</a>
	);
}

function Stepper({
	inspectionStep,
	resetInspection,
}: StepperProps): JSX.Element {
	const timeState = stateOf(inspectionStep, InspectionStep.TIME_AGGREGATION);
	const spaceState = stateOf(inspectionStep, InspectionStep.SPACE_AGGREGATION);
	const completed = [timeState, spaceState].filter(
		(state) => state === 'done',
	).length;
	const isComplete = inspectionStep === InspectionStep.COMPLETED;

	return (
		<section
			aria-labelledby="inspect-checklist-title"
			className="inspect-metrics-checklist fs-ui tw:flex tw:flex-col tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-4 tw:py-3">
				<h2 id="inspect-checklist-title" className="tw:text-sm tw:font-semibold">
					Metrics Inspector
				</h2>
				<span
					data-testid="inspect-checklist-progress"
					className={
						isComplete
							? 'tw:inline-flex tw:h-5 tw:items-center tw:rounded-sm tw:bg-success-soft tw:px-2 tw:text-xs tw:font-medium tw:text-success-ink tw:tabular-nums'
							: 'tw:inline-flex tw:h-5 tw:items-center tw:rounded-sm tw:bg-primary-soft tw:px-2 tw:text-xs tw:font-medium tw:text-primary-ink tw:tabular-nums'
					}
				>
					{`${completed} of 2`}
				</span>
			</div>
			<ol className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:py-2 tw:pl-0">
				<li
					data-state={timeState}
					className="tw:flex tw:gap-2.5 tw:px-4 tw:py-2 tw:text-[13px]"
				>
					<StepNumber number={1} state={timeState} showCheck />
					<span>
						First, align the data by selecting a{' '}
						<DocLink href={TEMPORAL_AGGREGATION_LINK}>Temporal Aggregation</DocLink>
					</span>
				</li>
				<li
					data-state={spaceState}
					className="tw:flex tw:gap-2.5 tw:px-4 tw:py-2 tw:text-[13px]"
				>
					<StepNumber number={2} state={spaceState} showCheck />
					<span>
						Add a <DocLink href={SPACE_AGGREGATION_LINK}>Spatial Aggregation</DocLink>
					</span>
				</li>
			</ol>
			{isComplete && (
				<div className="tw:flex tw:flex-col tw:gap-2 tw:border-t tw:border-border tw:px-4 tw:pt-3 tw:pb-4 tw:text-[13px]">
					<span className="tw:font-medium">
						You have completed your metric query tutorial.
					</span>
					<span className="tw:text-muted-foreground">
						You can inspect a new metric or reset the query builder.
					</span>
					<Button
						variant="outline"
						size="sm"
						className="tw:self-start"
						onClick={resetInspection}
					>
						<RotateCcw />
						Reset query
					</Button>
				</div>
			)}
		</section>
	);
}

export default Stepper;
