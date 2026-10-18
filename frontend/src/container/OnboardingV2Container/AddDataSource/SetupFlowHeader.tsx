import { MouseEvent, ReactNode } from 'react';
import LaunchChatSupport, {
	LaunchChatSupportProps,
} from 'components/LaunchChatSupport/LaunchChatSupport';
import { Button } from 'components/ui/button';
import { UserPlus, X } from 'lucide-react';

import SetupSteps, { SetupStepItem } from './SetupSteps';

interface SetupFlowHeaderProps {
	progressText: string;
	steps: SetupStepItem[];
	currentStep: number;
	onClose: (event: MouseEvent) => void;
	onInviteTeammate: () => void;
	chatSupport: Pick<LaunchChatSupportProps, 'attributes' | 'eventName'>;
}

const SECONDARY_BUTTON =
	'tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!';

/**
 * LaunchChatSupport renders an antd button, so it sits outside `fs-ui` and is
 * matched to the outline buttons with overrides.
 */
const CHAT_SUPPORT_BUTTON =
	'tw:inline-flex! tw:h-9! tw:items-center! tw:gap-2! tw:rounded-md! tw:border! tw:border-border! tw:bg-surface-raised! tw:px-3! tw:font-sans! tw:text-sm! tw:font-medium! tw:text-foreground! tw:shadow-none! tw:hover:bg-muted!';

function SetupFlowHeader({
	progressText,
	steps,
	currentStep,
	onClose,
	onInviteTeammate,
	chatSupport,
}: SetupFlowHeaderProps): JSX.Element {
	const actions: ReactNode = (
		<div className="tw:flex tw:items-center tw:gap-2">
			<div className="fs-ui tw:font-sans">
				<Button
					variant="outline"
					className={SECONDARY_BUTTON}
					onClick={onInviteTeammate}
				>
					<UserPlus aria-hidden />
					Invite a teammate
				</Button>
			</div>
			<LaunchChatSupport
				attributes={chatSupport.attributes}
				eventName={chatSupport.eventName}
				message=""
				buttonText="Contact Support"
				className={CHAT_SUPPORT_BUTTON}
			/>
		</div>
	);

	return (
		<header className="tw:sticky tw:top-0 tw:z-20 tw:border-b tw:border-border tw:bg-surface-raised tw:text-foreground">
			<div className="tw:flex tw:h-14 tw:items-center tw:justify-between tw:gap-4 tw:px-4 tw:md:px-8">
				<div className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Close"
						className="tw:text-muted-foreground"
						onClick={onClose}
					>
						<X aria-hidden />
					</Button>
					<span className="tw:text-sm tw:font-semibold">{progressText}</span>
				</div>
				{actions}
			</div>
			<SetupSteps steps={steps} currentStep={currentStep} />
		</header>
	);
}

export default SetupFlowHeader;
