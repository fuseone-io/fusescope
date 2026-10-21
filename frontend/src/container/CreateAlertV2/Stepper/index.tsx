import { ReactNode } from 'react';

interface StepperProps {
	stepNumber: number;
	label: string;
	/** Controls at the right of the step heading. */
	actions?: ReactNode;
}

/** The numbered heading of an editor step panel. */
function Stepper({ stepNumber, label, actions }: StepperProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:pb-4 tw:font-sans">
			<span
				aria-hidden="true"
				className="tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-primary tw:text-xs tw:font-semibold tw:text-primary-foreground"
			>
				{stepNumber}
			</span>
			<h2 className="tw:text-[15px] tw:font-semibold tw:text-foreground">
				{label}
			</h2>
			{actions && <div className="tw:ml-auto">{actions}</div>}
		</div>
	);
}

export default Stepper;
