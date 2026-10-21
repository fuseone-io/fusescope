import { Dispatch, SetStateAction } from 'react';
import TagKeyValueInput from 'components/TagKeyValueInput/TagKeyValueInput';

import DashboardImagePicker from '../DashboardImagePicker/DashboardImagePicker';
import { DASHBOARD_NAME_MAX_LENGTH } from '../../../constants';
import {
	FIELD_INPUT,
	FIELD_TEXTAREA,
} from '../../components/settingsClassNames';
import SettingsField from '../../components/SettingsField';

interface DashboardInfoFormProps {
	title: string;
	description: string;
	image: string;
	tags: string[];
	onTitleChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
	onImageChange: (value: string) => void;
	onTagsChange: Dispatch<SetStateAction<string[]>>;
}

// The picker hides its chevron for the icon-only trigger used elsewhere; this
// field shows it, at the 36px of the fields beside it.
const ICON_TRIGGER =
	'tw:h-9! tw:w-16! tw:min-w-16! tw:justify-between! tw:gap-1 tw:rounded-lg! tw:border! tw:border-input! tw:bg-surface-raised! tw:px-2! tw:[&_svg]:inline-block! tw:[&_svg]:size-3 tw:[&_svg]:text-subtle-foreground';

// The shared tag editor draws its own field; round it like the other fields.
const TAGS_FIELD =
	'tw:[&>div:first-child]:min-h-9 tw:[&>div:first-child]:rounded-lg tw:[&>div:first-child]:border-input tw:[&>div:first-child]:bg-surface-raised tw:[&>div:first-child]:font-mono';

function DashboardInfoForm({
	title,
	description,
	image,
	tags,
	onTitleChange,
	onDescriptionChange,
	onImageChange,
	onTagsChange,
}: DashboardInfoFormProps): JSX.Element {
	return (
		<section aria-label="Details" className="tw:flex tw:flex-col tw:gap-4">
			<div className="tw:flex tw:items-end tw:gap-3">
				<SettingsField label="Icon" className="tw:flex-none">
					<DashboardImagePicker
						image={image}
						onChange={onImageChange}
						triggerClassName={ICON_TRIGGER}
					/>
				</SettingsField>
				<SettingsField
					label="Dashboard Name"
					htmlFor="dashboard-settings-name"
					className="tw:flex-1"
				>
					<input
						id="dashboard-settings-name"
						data-testid="dashboard-name"
						className={FIELD_INPUT}
						value={title}
						maxLength={DASHBOARD_NAME_MAX_LENGTH}
						onChange={(e): void => onTitleChange(e.target.value)}
					/>
				</SettingsField>
			</div>

			<SettingsField label="Description" htmlFor="dashboard-settings-description">
				<textarea
					id="dashboard-settings-description"
					data-testid="dashboard-desc"
					rows={3}
					className={FIELD_TEXTAREA}
					value={description}
					onChange={(e): void => onDescriptionChange(e.target.value)}
				/>
			</SettingsField>

			<SettingsField label="Tags" hint="key:value">
				<TagKeyValueInput
					tags={tags}
					onTagsChange={onTagsChange}
					className={TAGS_FIELD}
				/>
			</SettingsField>
		</section>
	);
}

export default DashboardInfoForm;
