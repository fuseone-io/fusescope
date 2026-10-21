import type { Control, UseFormRegister } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { DatePicker } from 'antd';
import type { ServiceaccounttypesGettableFactorAPIKeyDTO } from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import {
	buildAPIKeyDeletePermission,
	buildAPIKeyUpdatePermission,
	buildSADetachPermission,
} from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import { Trash2 } from 'lucide-react';
import ActionButton from 'pages/Settings/components/ActionButton';
import DrawerField from 'pages/Settings/components/DrawerField';
import LockedValue from 'pages/Settings/components/LockedValue';
import { popupContainer } from 'utils/selectPopupContainer';

import { disabledDate, formatLastObservedAt } from '../utils';
import type { FormValues } from './types';
import { ExpiryMode, FORM_ID } from './types';

export interface EditKeyFormProps {
	register: UseFormRegister<FormValues>;
	control: Control<FormValues>;
	expiryMode: ExpiryMode;
	keyItem: ServiceaccounttypesGettableFactorAPIKeyDTO | null;
	isSaving: boolean;
	isDirty: boolean;
	onSubmit: () => void;
	onClose: () => void;
	onRevokeClick: () => void;
	formatTimezoneAdjustedTimestamp: (ts: string, format: string) => string;
	canUpdate?: boolean;
	isUpdateDenied?: boolean;
	accountId?: string;
}

function EditKeyForm({
	register,
	control,
	expiryMode,
	keyItem,
	isSaving,
	isDirty,
	onSubmit,
	onClose,
	onRevokeClick,
	formatTimezoneAdjustedTimestamp,
	canUpdate = true,
	isUpdateDenied = false,
	accountId = '',
}: EditKeyFormProps): JSX.Element {
	return (
		<>
			<form
				id={FORM_ID}
				className="edit-key-modal__form tw:flex tw:flex-col tw:gap-4"
				onSubmit={onSubmit}
			>
				<DrawerField label="Name" htmlFor="edit-key-name">
					{!canUpdate ? (
						<AuthZTooltip
							checks={[buildAPIKeyUpdatePermission(keyItem?.id ?? '')]}
							enabled={!!keyItem?.id}
							withPortal={false}
						>
							<LockedValue>
								<span className="edit-key-modal__id-text tw:truncate">
									{keyItem?.name || '—'}
								</span>
							</LockedValue>
						</AuthZTooltip>
					) : (
						<Input
							id="edit-key-name"
							className="edit-key-modal__input"
							placeholder="Enter key name"
							{...register('name')}
						/>
					)}
				</DrawerField>

				<DrawerField label="ID" htmlFor="edit-key-id">
					<LockedValue>
						<span
							id="edit-key-id"
							className="edit-key-modal__id-text tw:truncate tw:font-mono tw:text-xs"
						>
							{keyItem?.id || '—'}
						</span>
					</LockedValue>
				</DrawerField>

				<DrawerField label="Key" htmlFor="edit-key-display">
					<LockedValue>
						<span
							id="edit-key-display"
							className="edit-key-modal__key-text tw:font-mono tw:text-xs"
						>
							********************
						</span>
					</LockedValue>
				</DrawerField>

				<div
					className="tw:flex tw:flex-col tw:gap-2"
					title={
						isUpdateDenied
							? 'You do not have permission to update this key'
							: undefined
					}
				>
					<span className="tw:text-[13px] tw:font-medium tw:text-foreground">
						Expiration
					</span>
					<Controller
						name="expiryMode"
						control={control}
						render={({ field }): JSX.Element => (
							<SegmentedControl
								label="Expiration"
								value={field.value}
								onChange={(val): void => {
									if (canUpdate) {
										field.onChange(val);
									}
								}}
								disabled={!canUpdate}
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
					<DrawerField label="Expiration Date" htmlFor="edit-key-datepicker">
						<div className="edit-key-modal__datepicker">
							<Controller
								name="expiresAt"
								control={control}
								render={({ field }): JSX.Element => (
									<DatePicker
										value={field.value}
										id="edit-key-datepicker"
										onChange={field.onChange}
										popupClassName="edit-key-modal-datepicker-popup"
										getPopupContainer={popupContainer}
										disabledDate={disabledDate}
										disabled={!canUpdate}
										style={{ width: '100%' }}
									/>
								)}
							/>
						</div>
					</DrawerField>
				)}

				<div className="edit-key-modal__meta tw:flex tw:items-center tw:gap-2 tw:text-[13px]">
					<span className="tw:text-muted-foreground">Last Observed At</span>
					<span className="tw:font-medium tw:text-foreground tw:tabular-nums">
						{formatLastObservedAt(
							keyItem?.lastObservedAt ?? null,
							formatTimezoneAdjustedTimestamp,
						)}
					</span>
				</div>
			</form>

			<div className="edit-key-modal__footer tw:-mx-5 tw:mt-5 tw:-mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3">
				<AuthZTooltip
					checks={[
						buildAPIKeyDeletePermission(keyItem?.id ?? ''),
						buildSADetachPermission(accountId ?? ''),
					]}
					enabled={!!accountId && !!keyItem?.id}
				>
					<ActionButton
						variant="ghost"
						className="tw:text-error-ink tw:hover:bg-error-soft tw:hover:text-error-ink tw:dark:text-error"
						onClick={onRevokeClick}
						icon={<Trash2 aria-hidden="true" />}
					>
						Revoke Key
					</ActionButton>
				</AuthZTooltip>
				<div className="edit-key-modal__footer-right tw:flex tw:items-center tw:gap-2">
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<AuthZTooltip
						checks={[buildAPIKeyUpdatePermission(keyItem?.id ?? '')]}
						enabled={!!accountId && !!keyItem?.id}
					>
						<ActionButton
							type="submit"
							form={FORM_ID}
							loading={isSaving}
							disabled={!isDirty}
						>
							Save Changes
						</ActionButton>
					</AuthZTooltip>
				</div>
			</div>
		</>
	);
}

export default EditKeyForm;
