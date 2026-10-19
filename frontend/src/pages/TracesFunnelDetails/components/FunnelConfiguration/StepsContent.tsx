import { memo, useCallback } from 'react';
import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import { Plus, Undo2 } from 'lucide-react';
import HintTooltip from 'pages/TracesFunnels/components/HintTooltip/HintTooltip';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';
import { useAppContext } from 'providers/App/App';
import { SpanV3 } from 'types/api/trace/getTraceV3';

import FunnelStep from './FunnelStep';
import InterStepConfig from './InterStepConfig';

const OUTLINE_BUTTON =
	'tw:border-input tw:bg-surface-raised tw:text-[13px] tw:dark:bg-surface-raised';

function StepsContent({
	isTraceDetailsPage,
	span,
}: {
	isTraceDetailsPage?: boolean;
	span?: SpanV3;
}): JSX.Element {
	const { steps, handleAddStep, handleReplaceStep } = useFunnelContext();
	const { hasEditPermission } = useAppContext();

	const handleAddForNewStep = useCallback(() => {
		if (!span || !hasEditPermission) {
			return;
		}

		const stepWasAdded = handleAddStep();
		if (stepWasAdded) {
			handleReplaceStep(steps.length, span['service.name'], span.name);
		}
		logEvent(
			'Trace Funnels: span added for a new step from trace details page',
			{},
		);
	}, [span, handleAddStep, handleReplaceStep, steps.length, hasEditPermission]);

	return (
		<ol
			aria-label="Funnel steps"
			className="steps-content tw:m-0 tw:list-none tw:p-0"
		>
			{steps.map((step, index) => (
				<li key={`step-${index + 1}`} className="tw:flex tw:gap-3">
					<div
						aria-hidden="true"
						className="fs-ui tw:flex tw:flex-col tw:items-center tw:pt-3 tw:font-sans"
					>
						<span className="tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-primary tw:bg-primary-soft tw:text-xs tw:font-semibold tw:text-primary-ink">
							{index + 1}
						</span>
						<span className="tw:mt-1 tw:w-px tw:flex-1 tw:bg-border" />
					</div>
					<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:pb-2">
						<div className="funnel-step-wrapper tw:flex tw:items-start tw:gap-3">
							<FunnelStep stepData={step} index={index} stepsCount={steps.length} />
							{isTraceDetailsPage && span && (
								<HintTooltip
									title={
										!hasEditPermission
											? 'You need editor or admin access to replace steps'
											: ''
									}
								>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className={`fs-ui tw:mt-2 ${OUTLINE_BUTTON}`}
										disabled={
											(step.service_name === span['service.name'] &&
												step.span_name === span.name) ||
											!hasEditPermission
										}
										onClick={(): void =>
											handleReplaceStep(index, span['service.name'], span.name)
										}
									>
										<Undo2 className="tw:size-3" />
										Replace
									</Button>
								</HintTooltip>
							)}
						</div>
						{index < steps.length - 1 && (
							// the latency type should be sent with the n+1th step
							<InterStepConfig index={index + 1} step={steps[index + 1]} />
						)}
					</div>
				</li>
			))}
			<li className="fs-ui tw:flex tw:items-start tw:gap-3 tw:font-sans">
				<span
					aria-hidden="true"
					className="tw:mt-1 tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-dashed tw:border-input tw:text-xs tw:text-subtle-foreground"
				>
					+
				</span>
				<HintTooltip
					title={
						!hasEditPermission ? 'You need editor or admin access to add steps' : ''
					}
				>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className={OUTLINE_BUTTON}
						onClick={isTraceDetailsPage ? handleAddForNewStep : handleAddStep}
						disabled={!hasEditPermission}
					>
						<Plus className="tw:size-3.5" />
						<span>{isTraceDetailsPage ? 'Add for new Step' : 'Add Funnel Step'}</span>
					</Button>
				</HintTooltip>
			</li>
		</ol>
	);
}

StepsContent.defaultProps = {
	isTraceDetailsPage: false,
	span: undefined,
};

export default memo(StepsContent);
