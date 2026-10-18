interface StepperProps {
	stepNumber: number;
	label: string;
}

/** The numbered heading of an editor step panel. */
function Stepper({ stepNumber, label }: StepperProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:items-center tw:gap-3 tw:pb-4 tw:font-sans">
			<span
				aria-hidden="true"
				className="tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-primary tw:text-xs tw:font-semibold tw:text-primary-foreground"
			>
				{stepNumber}
			</span>
			<h2 className="tw:text-sm tw:font-semibold tw:text-foreground">{label}</h2>
		</div>
	);
}

export default Stepper;
