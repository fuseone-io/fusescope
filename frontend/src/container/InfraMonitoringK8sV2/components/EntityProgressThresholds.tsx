import {
	EntityProgressBarType,
	THRESHOLDS_BY_TYPE,
} from './EntityProgressBar.utils';

interface EntityProgressThresholdsProps {
	type: EntityProgressBarType;
	note?: string;
}

export function EntityProgressThresholds({
	type,
	note,
}: EntityProgressThresholdsProps): JSX.Element {
	return (
		<div
			className="tw:flex tw:max-w-80 tw:flex-col tw:gap-2 tw:py-1 tw:text-left tw:text-wrap tw:normal-case tw:tracking-normal"
			data-testid={`entity-progress-thresholds-${type}`}
		>
			{note && <p>{note}</p>}
			{THRESHOLDS_BY_TYPE[type].map((threshold) => (
				<div key={threshold.range} className="tw:flex tw:items-stretch tw:gap-2">
					<span
						className="tw:w-[3px] tw:flex-none tw:rounded-[1px]"
						style={{ background: threshold.color }}
					/>
					<div className="tw:flex tw:flex-col tw:gap-0.5">
						<div className="tw:flex tw:items-baseline tw:gap-1.5">
							<span className="tw:font-medium">{threshold.label}</span>
							<span className="tw:whitespace-nowrap tw:tabular-nums tw:opacity-70">
								{threshold.range}
							</span>
						</div>
						<p className="tw:opacity-70">{threshold.description}</p>
					</div>
				</div>
			))}
		</div>
	);
}
