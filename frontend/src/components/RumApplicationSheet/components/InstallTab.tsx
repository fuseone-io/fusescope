import type {
	RumtypesApplicationDTO,
	RumtypesGettableApplicationStatusDTO,
} from 'api/generated/services/fuseScope.schemas';
import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import { ArrowLeft } from 'lucide-react';

import { RevealedKey } from '../hooks/useApplicationSheet';
import AndroidInstall from './AndroidInstall';
import KeyOnceBanner from './KeyOnceBanner';
import SetupStatus from './SetupStatus';
import SheetFooter from './SheetFooter';
import WebInstall from './WebInstall';

interface InstallTabProps {
	application: RumtypesApplicationDTO;
	/** The key for the snippet: plaintext while known, else a placeholder. */
	publicKey: string;
	revealed?: RevealedKey;
	status?: RumtypesGettableApplicationStatusDTO;
	onAddOrigin?: (origin: string) => void;
	onBack: () => void;
	onDone: () => void;
}

function InstallTab({
	application,
	publicKey,
	revealed,
	status,
	onAddOrigin,
	onBack,
	onDone,
}: InstallTabProps): JSX.Element {
	return (
		<div
			className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col"
			data-testid="rum-app-install"
		>
			<div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-y-auto tw:px-6 tw:pt-5 tw:pb-6">
				{revealed && (
					<KeyOnceBanner
						applicationKey={revealed.key}
						applicationName={application.name}
					/>
				)}
				{application.platform === RumtypesPlatformDTO.android ? (
					<AndroidInstall
						application={application}
						publicKey={publicKey}
						keyKnown={Boolean(revealed)}
					/>
				) : (
					<WebInstall
						application={application}
						publicKey={publicKey}
						keyKnown={Boolean(revealed)}
						bundle={status?.browserBundle}
					/>
				)}
				<SetupStatus
					applicationId={application.id}
					applicationName={application.name}
					firstOrigin={application.allowedOrigins?.find((origin) => origin !== '*')}
					status={status}
					onAddOrigin={onAddOrigin}
				/>
			</div>
			<SheetFooter
				status={
					<Button variant="ghost" size="sm" onClick={onBack}>
						<ArrowLeft />
						Settings
					</Button>
				}
			>
				<Button
					variant="outline"
					size="sm"
					onClick={onDone}
					data-testid="rum-install-done"
				>
					Done
				</Button>
			</SheetFooter>
		</div>
	);
}

export default InstallTab;
