import { useId } from 'react';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Input } from 'components/ui/input';

import type { GuideRoute } from '../../guides/types';
import type { GuideForm } from '../hooks/useGuideForm';
import GuideStep from './GuideStep';

const ROUTE_OPTIONS: { value: GuideRoute; label: string; testId: string }[] = [
	{
		value: 'direct',
		label: 'Directly to FuseScope',
		testId: 'guide-route-direct',
	},
	{
		value: 'local',
		label: 'Through a local collector',
		testId: 'guide-route-local',
	},
];

const ROUTE_HINTS: Record<GuideRoute, string> = {
	direct:
		'Apps reach this FuseScope collector over the network. Simple setups; one hop.',
	local:
		'A collector next to your app batches, retries and adds host metrics. See Run the collector.',
};

const INPUT_CLASS =
	'tw:h-9 tw:bg-surface-raised tw:font-mono tw:text-[13px] tw:md:text-[13px] tw:dark:bg-surface-raised';

interface ServiceStepProps {
	form: GuideForm;
	done: boolean;
}

function ServiceStep({ form, done }: ServiceStepProps): JSX.Element {
	const serviceId = useId();
	const environmentId = useId();

	return (
		<GuideStep
			number={1}
			id="guide-step-service"
			title="Name your service"
			done={done}
			description={
				<>
					Used in every snippet below. It becomes{' '}
					<code className="tw:font-mono tw:text-xs">service.name</code> in FuseScope.
				</>
			}
		>
			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] tw:gap-3">
				<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
					<label htmlFor={serviceId} className="tw:text-[13px] tw:font-medium">
						Service name
					</label>
					<Input
						id={serviceId}
						value={form.service}
						onChange={(event): void => form.setService(event.target.value)}
						spellCheck={false}
						data-testid="guide-service"
						className={INPUT_CLASS}
					/>
				</div>
				<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
					<label htmlFor={environmentId} className="tw:text-[13px] tw:font-medium">
						Environment
					</label>
					<Input
						id={environmentId}
						value={form.environment}
						onChange={(event): void => form.setEnvironment(event.target.value)}
						spellCheck={false}
						data-testid="guide-environment"
						className={INPUT_CLASS}
					/>
				</div>
			</div>
			<div className="tw:flex tw:flex-col tw:gap-1.5">
				<span className="tw:text-[13px] tw:font-medium">Send data</span>
				<SegmentedControl
					label="Send data"
					options={ROUTE_OPTIONS}
					value={form.route}
					onChange={form.setRoute}
					className="tw:flex-wrap tw:self-start"
				/>
				<span className="tw:text-xs tw:text-subtle-foreground">
					{ROUTE_HINTS[form.route]}
				</span>
			</div>
		</GuideStep>
	);
}

export default ServiceStep;
