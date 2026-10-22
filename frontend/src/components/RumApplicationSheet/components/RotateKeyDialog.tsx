import { useState } from 'react';
import { RumtypesKeyOverlapDTO } from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { apiErrorMessage } from 'lib/rum/apiError';

interface RotateKeyDialogProps {
	open: boolean;
	onRotate: (overlap: RumtypesKeyOverlapDTO) => Promise<void>;
	onClose: () => void;
}

const OVERLAPS = [
	{ value: RumtypesKeyOverlapDTO['1h'], label: '1 hour' },
	{ value: RumtypesKeyOverlapDTO['24h'], label: '24 hours' },
	{ value: RumtypesKeyOverlapDTO['7d'], label: '7 days' },
];

function RotateKeyDialog({
	open,
	onRotate,
	onClose,
}: RotateKeyDialogProps): JSX.Element {
	const [overlap, setOverlap] = useState(RumtypesKeyOverlapDTO['24h']);
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string>();

	return (
		<Dialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					setFailure(undefined);
					onClose();
				}
			}}
		>
			<DialogContent data-testid="rum-rotate-dialog" className="tw:max-w-md">
				<DialogHeader>
					<DialogTitle>Rotate public key</DialogTitle>
				</DialogHeader>
				<DialogBody className="tw:gap-3">
					<DialogDescription>
						A new key is shown once. The current key keeps working during the overlap
						window, so pages already loaded keep sending, then stops.
					</DialogDescription>
					<div className="tw:flex tw:flex-col tw:gap-1.5">
						<span className="tw:text-[13px] tw:font-medium tw:text-foreground">
							Overlap window
						</span>
						<SegmentedControl
							label="Overlap window"
							options={OVERLAPS.map((option) => ({
								...option,
								testId: `rum-overlap-${option.value}`,
							}))}
							value={overlap}
							onChange={setOverlap}
							className="tw:self-start"
						/>
					</div>
					{failure && (
						<span role="alert" className="tw:text-xs tw:text-error">
							{failure}
						</span>
					)}
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={busy}
						data-testid="rum-rotate-confirm"
						onClick={async (): Promise<void> => {
							setBusy(true);
							try {
								await onRotate(overlap);
								setFailure(undefined);
							} catch (error) {
								setFailure(apiErrorMessage(error));
							} finally {
								setBusy(false);
							}
						}}
					>
						Rotate key
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default RotateKeyDialog;
