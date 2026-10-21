import { Button } from 'components/ui/button';
import { MemberRow } from 'components/MembersTable/MembersTable';
import { Trash2 } from 'lucide-react';
import ActionButton from 'pages/Settings/components/ActionButton';
import SettingsDialog from 'pages/Settings/components/SettingsDialog';

interface DeleteMemberDialogProps {
	open: boolean;
	isInvited: boolean;
	member: MemberRow | null;
	isDeleting: boolean;
	onClose: () => void;
	onConfirm: () => void;
}

function DeleteMemberDialog({
	open,
	isInvited,
	member,
	isDeleting,
	onClose,
	onConfirm,
}: DeleteMemberDialogProps): JSX.Element {
	const title = isInvited ? 'Revoke Invite' : 'Delete Member';

	const body = isInvited ? (
		<>
			Are you sure you want to revoke the invite for{' '}
			<strong className="tw:font-medium tw:text-foreground">
				{member?.email}
			</strong>
			? They will no longer be able to join the workspace using this invite.
		</>
	) : (
		<>
			Are you sure you want to delete{' '}
			<strong className="tw:font-medium tw:text-foreground">
				{member?.name || member?.email}
			</strong>
			? This will remove their access to the workspace.
		</>
	);

	return (
		<SettingsDialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onClose();
				}
			}}
			title={title}
			width="narrow"
			showCloseButton={false}
			footer={
				<>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<ActionButton
						variant="destructive"
						onClick={onConfirm}
						loading={isDeleting}
						icon={<Trash2 aria-hidden="true" />}
					>
						<span className="translate-safe">
							{isDeleting ? 'Processing...' : title}
						</span>
					</ActionButton>
				</>
			}
		>
			<p>{body}</p>
		</SettingsDialog>
	);
}

export default DeleteMemberDialog;
