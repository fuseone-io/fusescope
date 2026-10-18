import { cn } from 'lib/utils';

import { ALERT_STEPS } from './constants';
import { useActiveStep } from './useActiveStep';

const STEP_IDS = ALERT_STEPS.map((step) => step.id);

/** Jumps between the editor's step panels and marks the one in view. */
function StepsNav(): JSX.Element {
	const active = useActiveStep(STEP_IDS);

	return (
		<nav
			aria-label="Rule steps"
			data-testid="alert-steps-nav"
			className="fs-ui tw:sticky tw:top-4 tw:hidden tw:w-52 tw:flex-none tw:flex-col tw:gap-0.5 tw:self-start tw:font-sans tw:xl:flex"
		>
			{ALERT_STEPS.map((step, index) => {
				const isActive = step.id === active;
				return (
					<button
						key={step.id}
						type="button"
						aria-current={isActive ? 'step' : undefined}
						onClick={(): void =>
							document
								.getElementById(step.id)
								?.scrollIntoView({ behavior: 'smooth', block: 'start' })
						}
						className={cn(
							'tw:flex tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-md tw:border-0 tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-[13px] tw:text-muted-foreground tw:hover:bg-muted',
							isActive && 'tw:bg-primary-soft tw:font-medium tw:text-primary-ink',
						)}
					>
						<span
							aria-hidden="true"
							className={cn(
								'tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:text-xs tw:font-semibold',
								isActive
									? 'tw:bg-primary tw:text-primary-foreground'
									: 'tw:bg-muted tw:text-muted-foreground',
							)}
						>
							{index + 1}
						</span>
						{step.label}
					</button>
				);
			})}
		</nav>
	);
}

export default StepsNav;
