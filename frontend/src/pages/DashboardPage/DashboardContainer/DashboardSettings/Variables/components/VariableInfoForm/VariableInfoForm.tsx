import { DASHBOARD_NAME_MAX_LENGTH } from '../../../../constants';
import {
	FIELD_INPUT,
	FIELD_TEXTAREA,
} from '../../../components/settingsClassNames';
import SettingsField from '../../../components/SettingsField';

interface VariableInfoFormProps {
	title: string;
	description: string;
	onTitleChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
	visibleNameError: string | null;
}

function VariableInfoForm({
	title,
	description,
	onTitleChange,
	onDescriptionChange,
	visibleNameError,
}: VariableInfoFormProps): JSX.Element {
	return (
		<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] tw:items-start tw:gap-4">
			<SettingsField
				label="Name"
				htmlFor="variable-form-name"
				error={visibleNameError}
			>
				<input
					id="variable-form-name"
					data-testid="variable-name"
					className={`${FIELD_INPUT} tw:font-mono tw:text-xs`}
					value={title}
					maxLength={DASHBOARD_NAME_MAX_LENGTH}
					aria-invalid={visibleNameError ? true : undefined}
					onChange={(e): void => onTitleChange(e.target.value)}
					placeholder="Unique name of the variable"
				/>
			</SettingsField>

			<SettingsField label="Description" htmlFor="variable-form-description">
				<textarea
					id="variable-form-description"
					className={FIELD_TEXTAREA}
					value={description}
					placeholder="Enter a description for the variable"
					data-testid="dashboard-desc"
					rows={1}
					onChange={(e): void => onDescriptionChange(e.target.value)}
				/>
			</SettingsField>
		</div>
	);
}

export default VariableInfoForm;
