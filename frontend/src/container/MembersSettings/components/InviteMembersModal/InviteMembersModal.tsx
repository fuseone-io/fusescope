import { useCallback } from 'react';
import { toast } from '@signozhq/ui/sonner';
import InviteMembers from 'components/InviteMembers/InviteMembers';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { Loader2, UserPlus } from 'lucide-react';

export interface InviteMembersModalProps {
	open: boolean;
	onClose: () => void;
	onComplete?: () => void;
}

function InviteMembersModal({
	open,
	onClose,
	onComplete,
}: InviteMembersModalProps): JSX.Element {
	const handleSuccess = useCallback((): void => {
		toast.success('Invites sent successfully', { position: 'top-right' });
		onClose();
		onComplete?.();
	}, [onClose, onComplete]);

	const handlePartialSuccess = useCallback((): void => {
		toast.warning('Some invites failed', { position: 'top-right' });
		onComplete?.();
	}, [onComplete]);

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onClose();
				}
			}}
		>
			<DialogContent
				aria-describedby={undefined}
				className="invite-members-modal tw:max-w-[700px]"
			>
				<DialogHeader className="tw:border-b tw:border-border tw:pb-3">
					<DialogTitle>Invite Team Members</DialogTitle>
				</DialogHeader>
				<div className="tw:px-5 tw:pt-4 tw:pb-3">
					<InviteMembers
						onSuccess={handleSuccess}
						onPartialSuccess={handlePartialSuccess}
						renderFooter={({ submit, canSubmit, isSubmitting }): JSX.Element => (
							<div className="invite-members-modal__footer tw:-mx-5 tw:-mb-3 tw:flex tw:items-center tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3">
								<Button type="button" variant="outline" onClick={onClose}>
									Cancel
								</Button>
								<span
									className="tw:inline-flex"
									title={
										canSubmit ? undefined : 'Add at least one team member to invite'
									}
								>
									<Button type="button" onClick={submit} disabled={!canSubmit}>
										{isSubmitting ? (
											<Loader2 className="tw:animate-spin" aria-hidden="true" />
										) : (
											<UserPlus aria-hidden="true" />
										)}
										<span className="translate-safe">
											{isSubmitting ? 'Inviting...' : 'Invite Team Members'}
										</span>
									</Button>
								</span>
							</div>
						)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default InviteMembersModal;
