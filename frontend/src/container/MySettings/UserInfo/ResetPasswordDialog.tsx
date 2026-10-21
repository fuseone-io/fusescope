import { useState } from 'react';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react';

const PLACEHOLDER = '*************';

interface ResetPasswordDialogProps {
	open: boolean;
	currentPassword: string;
	newPassword: string;
	isLoading: boolean;
	isDisabled: boolean;
	passwordsMatch: boolean;
	onCurrentPasswordChange: (value: string) => void;
	onNewPasswordChange: (value: string) => void;
	onClose: () => void;
	onSubmit: () => void;
}

function ResetPasswordDialog({
	open,
	currentPassword,
	newPassword,
	isLoading,
	isDisabled,
	passwordsMatch,
	onCurrentPasswordChange,
	onNewPasswordChange,
	onClose,
	onSubmit,
}: ResetPasswordDialogProps): JSX.Element {
	const [showCurrent, setShowCurrent] = useState(false);

	const submitOnEnter = (key: string): void => {
		if (key === 'Enter' && !isDisabled) {
			onSubmit();
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					setShowCurrent(false);
					onClose();
				}
			}}
		>
			<DialogContent
				aria-describedby={undefined}
				className="reset-password-modal tw:max-w-md"
			>
				<DialogHeader className="tw:border-b tw:border-border tw:pb-3">
					<DialogTitle>Reset password</DialogTitle>
				</DialogHeader>
				<DialogBody className="tw:gap-4 tw:pt-4">
					<div className="tw:flex tw:flex-col tw:gap-2">
						<Label htmlFor="current-password" className="tw:text-foreground">
							Current password
						</Label>
						<div className="tw:relative">
							<Input
								id="current-password"
								data-testid="current-password-textbox"
								type={showCurrent ? 'text' : 'password'}
								autoComplete="off"
								placeholder={PLACEHOLDER}
								disabled={isLoading}
								value={currentPassword}
								onChange={(e): void => onCurrentPasswordChange(e.target.value)}
								onKeyDown={(e): void => submitOnEnter(e.key)}
								className="tw:pr-9"
							/>
							<button
								type="button"
								aria-label={showCurrent ? 'Hide password' : 'Show password'}
								onClick={(): void => setShowCurrent((shown) => !shown)}
								className="tw:absolute tw:top-1/2 tw:right-2 tw:flex tw:size-6 tw:-translate-y-1/2 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-sm tw:border-0 tw:bg-transparent tw:text-muted-foreground tw:hover:text-foreground"
							>
								{showCurrent ? (
									<EyeOff className="tw:size-4" aria-hidden="true" />
								) : (
									<Eye className="tw:size-4" aria-hidden="true" />
								)}
							</button>
						</div>
					</div>

					<div className="tw:flex tw:flex-col tw:gap-2">
						<Label htmlFor="new-password" className="tw:text-foreground">
							New password
						</Label>
						<Input
							id="new-password"
							data-testid="new-password-textbox"
							type="password"
							autoComplete="off"
							placeholder={PLACEHOLDER}
							disabled={isLoading}
							value={newPassword}
							aria-invalid={passwordsMatch || undefined}
							onChange={(e): void => onNewPasswordChange(e.target.value)}
							onKeyDown={(e): void => submitOnEnter(e.key)}
						/>
						{passwordsMatch && (
							<span className="password-error-text tw:text-xs tw:text-error-ink tw:dark:text-error">
								New password must be different from current password
							</span>
						)}
					</div>
				</DialogBody>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={onSubmit}
						disabled={isDisabled}
						data-testid="reset-password-btn"
					>
						{isLoading ? (
							<Loader2 className="tw:animate-spin" aria-hidden="true" />
						) : (
							<Check aria-hidden="true" />
						)}
						<span className="translate-safe">Reset password</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default ResetPasswordDialog;
