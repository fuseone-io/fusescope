import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';
import HintTooltip from 'pages/TracesFunnels/components/HintTooltip/HintTooltip';
import { useAppContext } from 'providers/App/App';
import { FunnelStepData, LatencyOptions } from 'types/api/traceFunnels';

import SegmentedControl from '../SegmentedControl/SegmentedControl';

function InterStepConfig({
	index,
	step,
}: {
	index: number;
	step: FunnelStepData;
}): JSX.Element {
	const { handleStepChange: onStepChange } = useFunnelContext();
	const { hasEditPermission } = useAppContext();
	const options = Object.entries(LatencyOptions).map(([key, value]) => ({
		label: key,
		value,
	}));

	return (
		<div className="inter-step-config fs-ui tw:flex tw:items-center tw:gap-2.5 tw:pt-2.5 tw:pb-0.5 tw:font-sans">
			<span className="tw:text-xs tw:whitespace-nowrap tw:text-muted-foreground">
				Latency type
			</span>
			<span
				aria-hidden="true"
				className="tw:flex-1 tw:border-t tw:border-dashed tw:border-border"
			/>
			<HintTooltip
				title={
					!hasEditPermission
						? 'You need edit permissions to change the latency type'
						: ''
				}
			>
				<SegmentedControl
					label="Latency type"
					size="sm"
					value={step.latency_type ?? LatencyOptions.P99}
					options={options}
					disabled={!hasEditPermission}
					onChange={(value): void =>
						onStepChange(index, {
							...step,
							latency_type: value as LatencyOptions,
						})
					}
				/>
			</HintTooltip>
		</div>
	);
}

export default InterStepConfig;
