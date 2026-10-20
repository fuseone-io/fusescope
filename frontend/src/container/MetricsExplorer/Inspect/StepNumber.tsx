import { cn } from 'lib/utils';
import { Check } from 'lucide-react';

export type StepState = 'done' | 'current' | 'pending';

/** A numbered circle: green tick when done, filled primary when current. */
function StepNumber({
	number,
	state,
	showCheck = false,
}: {
	number: number;
	state: StepState;
	/** Replace the number with a tick once done. */
	showCheck?: boolean;
}): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:border tw:text-xs tw:font-semibold',
				state === 'done' &&
					'tw:border-transparent tw:bg-success-soft tw:text-success-ink',
				state === 'current' &&
					'tw:border-transparent tw:bg-primary tw:text-primary-foreground',
				state === 'pending' &&
					'tw:border-border tw:bg-surface-sunken tw:text-muted-foreground',
			)}
		>
			{showCheck && state === 'done' ? <Check className="tw:size-3.5" /> : number}
		</span>
	);
}

export default StepNumber;
