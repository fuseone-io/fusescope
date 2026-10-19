import { useMemo, useState } from 'react';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';

import SegmentedControl from '../SegmentedControl/SegmentedControl';
import StepsTransitionMetrics from './StepsTransitionMetrics';
import TopSlowestTraces from './TopSlowestTraces';
import TopTracesWithErrors from './TopTracesWithErrors';

export interface StepTransition {
	value: string;
	label: string;
}

function generateStepTransitions(stepsCount: number): StepTransition[] {
	return Array.from({ length: stepsCount - 1 }, (_, index) => ({
		value: `${index + 1}_to_${index + 2}`,
		label: `Step ${index + 1} → Step ${index + 2}`,
	}));
}

function StepsTransitionResults(): JSX.Element {
	const { steps, funnelId } = useFunnelContext();
	const stepTransitions = generateStepTransitions(steps.length);
	const [selectedTransition, setSelectedTransition] = useState<string>(
		stepTransitions[0]?.value || '',
	);

	const [stepAOrder, stepBOrder] = useMemo(() => {
		const [a, b] = selectedTransition.split('_to_');
		return [parseInt(a, 10), parseInt(b, 10)];
	}, [selectedTransition]);

	return (
		<div className="steps-transition-results tw:flex tw:flex-col tw:gap-4">
			<SegmentedControl
				label="Step transition"
				value={selectedTransition}
				options={stepTransitions}
				onChange={setSelectedTransition}
				className="tw:self-start"
			/>
			<StepsTransitionMetrics
				selectedTransition={selectedTransition}
				transitions={stepTransitions}
				startStep={stepAOrder}
				endStep={stepBOrder}
			/>
			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] tw:gap-4">
				<TopSlowestTraces
					funnelId={funnelId}
					stepAOrder={stepAOrder}
					stepBOrder={stepBOrder}
					steps={steps}
				/>
				<TopTracesWithErrors
					funnelId={funnelId}
					stepAOrder={stepAOrder}
					stepBOrder={stepBOrder}
					steps={steps}
				/>
			</div>
		</div>
	);
}

export default StepsTransitionResults;
