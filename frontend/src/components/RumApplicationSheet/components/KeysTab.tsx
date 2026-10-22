import { useState } from 'react';
import type { RumtypesGettableApplicationKeyDTO } from 'api/generated/services/fuseScope.schemas';
import { RumtypesKeyOverlapDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import { RefreshCw } from 'lucide-react';

import { RevealedKey } from '../hooks/useApplicationSheet';
import { activeKey, isRotating } from '../utils/keys';
import ConfirmDialog from './ConfirmDialog';
import KeyOnceBanner from './KeyOnceBanner';
import KeyRow from './KeyRow';
import RotateKeyDialog from './RotateKeyDialog';
import SectionHeading from './SectionHeading';

interface KeysTabProps {
	applicationName: string;
	keys: RumtypesGettableApplicationKeyDTO[];
	revealed?: RevealedKey;
	readOnly: boolean;
	onRotate: (keyId: string, overlap: RumtypesKeyOverlapDTO) => Promise<void>;
	onRevoke: (keyId: string) => Promise<void>;
	onCreate: () => Promise<void>;
}

function KeysTab({
	applicationName,
	keys,
	revealed,
	readOnly,
	onRotate,
	onRevoke,
	onCreate,
}: KeysTabProps): JSX.Element {
	const [rotating, setRotating] = useState(false);
	const [revoking, setRevoking] = useState<RumtypesGettableApplicationKeyDTO>();
	const active = activeKey(keys);
	const busyRotation = isRotating(keys);

	return (
		<div
			data-testid="rum-app-keys"
			className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-y-auto tw:px-6 tw:pt-5 tw:pb-6"
		>
			{revealed && (
				<KeyOnceBanner
					applicationKey={revealed.key}
					applicationName={applicationName}
				/>
			)}
			<p className="tw:text-[13px] tw:text-muted-foreground">
				The public key is write-only: it can send data for{' '}
				<span className="tw:font-mono tw:text-foreground">{applicationName}</span>{' '}
				from its allowed origins and nothing else. Keys are stored hashed, so only
				the last characters are shown.
			</p>
			<section
				aria-label="Keys"
				className="tw:flex tw:flex-col tw:divide-y tw:divide-border tw:rounded-[10px] tw:border tw:border-border"
			>
				{keys.map((key) => (
					<KeyRow
						key={key.id}
						applicationKey={key}
						onRevoke={readOnly ? undefined : (): void => setRevoking(key)}
					/>
				))}
				{keys.length === 0 && (
					<div className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-4 tw:py-3">
						<span className="tw:text-[13px] tw:text-muted-foreground">
							No usable key. The SDK’s data is refused until you create one.
						</span>
						{!readOnly && (
							<Button size="sm" data-testid="rum-key-create" onClick={onCreate}>
								Create key
							</Button>
						)}
					</div>
				)}
			</section>
			{active && !readOnly && (
				<section
					aria-labelledby="rum-key-rotate"
					className="tw:flex tw:flex-col tw:gap-2"
				>
					<SectionHeading id="rum-key-rotate">Rotate key</SectionHeading>
					<p className="tw:text-xs tw:text-muted-foreground">
						A new key is shown once. The current key keeps working during the overlap
						window, then stops.
					</p>
					<Button
						variant="outline"
						size="sm"
						className="tw:self-start"
						data-testid="rum-key-rotate"
						disabled={busyRotation}
						title={
							busyRotation
								? 'Finish the current rotation or revoke the previous key first'
								: undefined
						}
						onClick={(): void => setRotating(true)}
					>
						<RefreshCw />
						Rotate key
					</Button>
					{busyRotation && (
						<span className="tw:text-xs tw:text-subtle-foreground">
							One rotation at a time. Revoke the previous key to rotate again sooner.
						</span>
					)}
				</section>
			)}
			{active && (
				<RotateKeyDialog
					open={rotating}
					onClose={(): void => setRotating(false)}
					onRotate={async (overlap): Promise<void> => {
						await onRotate(active.id, overlap);
						setRotating(false);
					}}
				/>
			)}
			<ConfirmDialog
				open={Boolean(revoking)}
				title="Revoke this key?"
				description="Data sent with it is refused from now on. This cannot be undone."
				confirmLabel="Revoke key"
				onCancel={(): void => setRevoking(undefined)}
				onConfirm={async (): Promise<void> => {
					if (revoking) {
						await onRevoke(revoking.id);
					}
					setRevoking(undefined);
				}}
			/>
		</div>
	);
}

export default KeysTab;
