import { FormEvent, useState } from 'react';
import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import { apiErrorMessage } from 'lib/rum/apiError';

import { ApplicationFormValues } from '../types';
import ApplicationSection from './ApplicationSection';
import ConfirmDialog from './ConfirmDialog';
import OriginsSection from './OriginsSection';
import PrivacySection from './PrivacySection';
import SheetFooter from './SheetFooter';
import WhereTag from './WhereTag';

interface SettingsTabProps {
	initial: ApplicationFormValues;
	platform: RumtypesPlatformDTO;
	/** Not created yet: the submit button creates it. */
	creating: boolean;
	readOnly: boolean;
	saving: boolean;
	onSubmit: (values: ApplicationFormValues) => Promise<void>;
	onDelete?: () => Promise<void>;
	onCancel: () => void;
}

type FieldErrors = Partial<Record<'name' | 'environment', string>>;

function validate(values: ApplicationFormValues): FieldErrors {
	const errors: FieldErrors = {};
	if (!values.name.trim()) {
		errors.name = 'Enter a name';
	}
	if (!values.environment.trim()) {
		errors.environment = 'Enter an environment';
	}
	return errors;
}

function SettingsTab({
	initial,
	platform,
	creating,
	readOnly,
	saving,
	onSubmit,
	onDelete,
	onCancel,
}: SettingsTabProps): JSX.Element {
	const [values, setValues] = useState(initial);
	const [errors, setErrors] = useState<FieldErrors>({});
	const [failure, setFailure] = useState<string>();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const onChange = (patch: Partial<ApplicationFormValues>): void =>
		setValues((current) => ({ ...current, ...patch }));

	const submit = async (event: FormEvent): Promise<void> => {
		event.preventDefault();
		const found = validate(values);
		setErrors(found);
		if (Object.keys(found).length > 0) {
			return;
		}
		try {
			setFailure(undefined);
			await onSubmit(values);
		} catch (error) {
			setFailure(apiErrorMessage(error));
		}
	};

	let status = null;
	if (failure) {
		status = (
			<span role="alert" className="tw:text-xs tw:text-error">
				{failure}
			</span>
		);
	} else if (readOnly) {
		status = (
			<span className="tw:text-xs tw:text-subtle-foreground">
				Only admins and editors can change applications.
			</span>
		);
	} else if (creating) {
		status = (
			<span className="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-subtle-foreground">
				<WhereTag where="SDK" /> settings are written into the snippet.
			</span>
		);
	} else if (onDelete) {
		status = (
			<Button
				type="button"
				variant="ghost"
				size="sm"
				data-testid="rum-app-delete"
				className="tw:text-error-ink tw:hover:bg-error-soft"
				onClick={(): void => setConfirmDelete(true)}
			>
				Delete application
			</Button>
		);
	}

	return (
		<form
			onSubmit={submit}
			noValidate
			data-testid="rum-app-settings"
			className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col"
		>
			<div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-y-auto tw:px-6 tw:pt-5 tw:pb-6">
				<ApplicationSection
					values={values}
					onChange={onChange}
					platform={platform}
					errors={errors}
					readOnly={readOnly}
				/>
				<OriginsSection values={values} onChange={onChange} readOnly={readOnly} />
				<PrivacySection values={values} onChange={onChange} readOnly={readOnly} />
			</div>
			<SheetFooter status={status}>
				<Button type="button" variant="outline" size="sm" onClick={onCancel}>
					{readOnly ? 'Close' : 'Cancel'}
				</Button>
				{!readOnly && (
					<Button
						type="submit"
						size="sm"
						disabled={saving}
						data-testid="rum-app-submit"
					>
						{creating ? 'Create application' : 'Save'}
					</Button>
				)}
			</SheetFooter>
			{onDelete && (
				<ConfirmDialog
					open={confirmDelete}
					title={`Delete ${initial.name}?`}
					description="Its keys stop working at once and the SDK's data is refused. Data already stored stays in traces and logs."
					confirmLabel="Delete application"
					onConfirm={async (): Promise<void> => {
						await onDelete();
						setConfirmDelete(false);
					}}
					onCancel={(): void => setConfirmDelete(false)}
				/>
			)}
		</form>
	);
}

export default SettingsTab;
