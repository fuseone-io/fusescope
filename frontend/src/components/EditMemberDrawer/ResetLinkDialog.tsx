import { Button } from 'components/ui/button';
import { Check, Copy } from 'lucide-react';
import SettingsDialog from 'pages/Settings/components/SettingsDialog';

interface ResetLinkDialogProps {
	open: boolean;
	linkType: 'invite' | 'reset' | null;
	resetLink: string | null;
	expiresAt: string | null;
	hasCopied: boolean;
	onClose: () => void;
	onCopy: () => void;
}

function ResetLinkDialog({
	open,
	linkType,
	resetLink,
	expiresAt,
	hasCopied,
	onClose,
	onCopy,
}: ResetLinkDialogProps): JSX.Element {
	return (
		<SettingsDialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onClose();
				}
			}}
			title={linkType === 'invite' ? 'Invite Link' : 'Password Reset Link'}
			className="reset-link-dialog"
			bodyClassName="tw:flex tw:flex-col tw:gap-3"
		>
			<p className="reset-link-dialog__description">
				{linkType === 'invite'
					? 'Share this one-time link with the team member to complete their account setup.'
					: 'This creates a one-time link the team member can use to set a new password for their FuseScope account.'}
			</p>
			<div className="reset-link-dialog__link-row tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:border tw:border-border tw:bg-surface-sunken tw:py-1 tw:pr-1 tw:pl-3">
				<span className="reset-link-dialog__link-text tw:min-w-0 tw:flex-1 tw:truncate tw:font-mono tw:text-xs tw:text-foreground">
					{resetLink}
				</span>
				<Button type="button" variant="ghost" size="sm" onClick={onCopy}>
					{hasCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
					<span className="translate-safe">{hasCopied ? 'Copied!' : 'Copy'}</span>
				</Button>
			</div>
			{expiresAt && (
				<p className="reset-link-dialog__description">
					This link expires on {expiresAt}.
				</p>
			)}
		</SettingsDialog>
	);
}

export default ResetLinkDialog;
