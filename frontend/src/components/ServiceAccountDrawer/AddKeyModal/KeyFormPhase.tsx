import type { Control, UseFormRegister } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { DatePicker } from 'antd';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { AuthZGuardContent } from 'lib/authz/components/AuthZGuard/AuthZGuardContent';
import {
	APIKeyCreatePermission,
	buildSAAttachPermission,
} from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import ActionButton from 'pages/Settings/components/ActionButton';
import { popupContainer } from 'utils/selectPopupContainer';

import { disabledDate } from '../utils';
import type { FormValues } from './types';
import { ExpiryMode, FORM_ID } from './types';

export interface KeyFormPhaseProps {
	register: UseFormRegister<FormValues>;
	control: Control<FormValues>;
	expiryMode: ExpiryMode;
	isSubmitting: boolean;
	isValid: boolean;
	onSubmit: () => void;
	onClose: () => void;
	accountId?: string;
}

function KeyFormPhase({
	register,
	control,
	expiryMode,
	isSubmitting,
	isValid,
	onSubmit,
	onClose,
	accountId,
}: KeyFormPhaseProps): JSX.Element {
	const checks = accountId
		? [APIKeyCreatePermission, buildSAAttachPermission(accountId)]
		: [];

	return (
		<>
			<form
				id={FORM_ID}
				className="add-key-modal__form tw:flex tw:flex-col tw:gap-4"
				onSubmit={onSubmit}
			>
				<AuthZGuardContent checks={checks}>
					<>
						<div className="tw:flex tw:flex-col tw:gap-2">
							<Label htmlFor="key-name" className="tw:text-foreground">
								Name <span className="tw:text-error-ink tw:dark:text-error">*</span>
							</Label>
							<Input
								id="key-name"
								placeholder="Enter key name e.g.: Service Owner"
								className="add-key-modal__input"
								data-testid="add-key-name-input"
								{...register('keyName', {
									required: true,
									validate: (v) => !!v.trim(),
								})}
							/>
						</div>

						<div className="tw:flex tw:flex-col tw:gap-2">
							<span className="tw:text-sm tw:font-medium tw:text-foreground">
								Expiration
							</span>
							<Controller
								name="expiryMode"
								control={control}
								render={({ field }): JSX.Element => (
									<SegmentedControl
										label="Expiration"
										value={field.value}
										onChange={field.onChange}
										className="tw:self-start"
										options={[
											{ value: ExpiryMode.NONE, label: 'No Expiration' },
											{ value: ExpiryMode.DATE, label: 'Set Expiration Date' },
										]}
									/>
								)}
							/>
						</div>

						{expiryMode === ExpiryMode.DATE && (
							<div className="tw:flex tw:flex-col tw:gap-2">
								<Label htmlFor="expiry-date" className="tw:text-foreground">
									Expiration Date
								</Label>
								<div className="add-key-modal__datepicker">
									<Controller
										name="expiryDate"
										control={control}
										render={({ field }): JSX.Element => (
											<DatePicker
												id="expiry-date"
												value={field.value}
												onChange={field.onChange}
												popupClassName="add-key-modal-datepicker-popup"
												getPopupContainer={popupContainer}
												disabledDate={disabledDate}
												style={{ width: '100%' }}
											/>
										)}
									/>
								</div>
							</div>
						)}
					</>
				</AuthZGuardContent>
			</form>

			<div className="add-key-modal__footer tw:-mx-5 tw:mt-5 tw:-mb-4 tw:flex tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3">
				<Button
					type="button"
					variant="outline"
					onClick={onClose}
					data-testid="add-key-cancel-btn"
				>
					Cancel
				</Button>
				<AuthZTooltip checks={checks} enabled={!!accountId}>
					<ActionButton
						type="submit"
						form={FORM_ID}
						loading={isSubmitting}
						disabled={!isValid}
						testId="add-key-submit-btn"
					>
						Create Key
					</ActionButton>
				</AuthZTooltip>
			</div>
		</>
	);
}

export default KeyFormPhase;
