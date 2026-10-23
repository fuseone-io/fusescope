import { Button } from 'components/ui/button';

import type { Guide } from '../../guides/types';
import type { VerifyState } from '../types';
import GuideStep from './GuideStep';
import ReceivingPanel from './ReceivingPanel';
import WaitingPanel from './WaitingPanel';

interface VerifyStepProps {
	guide: Guide;
	service: string;
	endpoint: string;
	state: VerifyState;
	onStart: () => void;
}

function VerifyStep({
	guide,
	service,
	endpoint,
	state,
	onStart,
}: VerifyStepProps): JSX.Element {
	return (
		<GuideStep
			number={4}
			id="guide-step-verify"
			title="Check the connection"
			done={state.status === 'receiving'}
		>
			{state.status === 'idle' && (
				<div className="tw:flex tw:flex-col tw:items-start tw:gap-2">
					<p className="tw:text-[13px] tw:text-muted-foreground">
						Start your app and send it a request.
					</p>
					<Button
						size="sm"
						onClick={onStart}
						disabled={!service.trim()}
						data-testid="guide-start"
					>
						I started my app
					</Button>
				</div>
			)}
			{state.status === 'waiting' && (
				<WaitingPanel
					guide={guide}
					service={service}
					endpoint={endpoint}
					status={state.data}
				/>
			)}
			{state.status === 'receiving' && (
				<ReceivingPanel service={service} status={state.data} />
			)}
		</GuideStep>
	);
}

export default VerifyStep;
